// hooks/useWebRTC.ts
// カメラ共有（P2P メッシュ）。WebRTC の "perfect negotiation" パターンで、
// 後から入室した人・後からカメラをONにした人・同時にONにした人でも確実につながるようにしている。
'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// 映像は必ず中継サーバー（TURN）経由にする。直接つなぐ（P2P）と、同じ部屋の人に自分の IP アドレスが伝わってしまうため。
// 中継の接続情報は /api/turn から受け取る。中継が使えないときはカメラ映像を共有しない（IP を守ることを優先）。
export type RelayStatus = 'loading' | 'relay' | 'unavailable'
async function loadRelayConfig(): Promise<RTCConfiguration | null> {
  try {
    const res = await fetch('/api/turn', { cache: 'no-store' })
    const data = await res.json()
    if (!data?.relay || !Array.isArray(data.iceServers) || data.iceServers.length === 0) return null
    return { iceServers: data.iceServers, iceTransportPolicy: 'relay' }
  } catch { return null }
}

type Peer = {
  pc: RTCPeerConnection
  polite: boolean            // 衝突時に相手の offer を優先する側
  makingOffer: boolean
  ignoreOffer: boolean
  pendingCandidates: RTCIceCandidateInit[]
  queue: Promise<void>       // シグナルを順番に処理する
}

type Signal = { id: string; room_id?: string; from_user: string; type: string; payload: any }

/**
 * @param memberIds 今ルームに接続している他のメンバー（自分以外）
 */
export function useWebRTC(roomId: string, userId: string, cameraOn: boolean, memberIds: string[] = []) {
  const supabase = createClient()
  const localStreamRef = useRef<MediaStream | null>(null)
  const peersRef = useRef<Map<string, Peer>>(new Map())
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const configRef = useRef<RTCConfiguration | null>(null)
  const [relayStatus, setRelayStatus] = useState<RelayStatus>('loading')
  useEffect(() => {
    let alive = true
    const load = async () => {
      const cfg = await loadRelayConfig()
      if (!alive) return
      configRef.current = cfg
      setRelayStatus(cfg ? 'relay' : 'unavailable')
    }
    load()
    // 接続情報は 4 時間で切れるので、3 時間ごとに更新する
    const t = setInterval(async () => {
      const cfg = await loadRelayConfig()
      if (!alive || !cfg) return
      configRef.current = cfg
      peersRef.current.forEach(p => { try { p.pc.setConfiguration(cfg) } catch {} })
    }, 3 * 60 * 60 * 1000)
    return () => { alive = false; clearInterval(t) }
  }, [])
  // 今この部屋にいるメンバーだけと通信する（部屋の外の人から接続を求められても応じない）
  const memberIdsRef = useRef<string[]>(memberIds)
  memberIdsRef.current = memberIds
  // メンバー一覧の反映より先に届いたシグナルは少しだけ保留する
  const heldRef = useRef<{ s: Signal; at: number }[]>([])

  function send(to: string, type: string, payload: unknown) {
    return (supabase as any).from('webrtc_signals').insert({ room_id: roomId, from_user: userId, to_user: to, type, payload })
      .then(({ error }: { error: { message: string } | null }) => { if (error) console.error('signal send error:', error.message) })
  }

  function setRemote(id: string, stream: MediaStream | null) {
    setRemoteStreams(prev => {
      const next = new Map(prev)
      if (stream) next.set(id, stream); else next.delete(id)
      return next
    })
  }

  function closePeer(id: string) {
    const peer = peersRef.current.get(id)
    if (!peer) return
    peer.pc.close()
    peersRef.current.delete(id)
    setRemote(id, null)
  }

  /** 自分のカメラ映像の送信状態を、今のカメラ ON/OFF に合わせる（変化があれば再交渉される） */
  function syncTracks(pc: RTCPeerConnection) {
    const stream = localStreamRef.current
    const sending = pc.getSenders().filter(s => s.track)
    if (stream) {
      for (const track of stream.getTracks()) {
        if (!sending.some(s => s.track === track)) pc.addTrack(track, stream)
      }
    }
    for (const sender of sending) {
      if (!stream || !stream.getTracks().includes(sender.track!)) pc.removeTrack(sender)
    }
  }

  function ensurePeer(targetId: string): Peer | null {
    const existing = peersRef.current.get(targetId)
    if (existing && existing.pc.connectionState !== 'closed') return existing
    // 中継サーバーが使えないときは接続しない（IP アドレスを相手に渡さないため）
    if (!configRef.current) return null

    const pc = new RTCPeerConnection(configRef.current)
    const peer: Peer = { pc, polite: userId > targetId, makingOffer: false, ignoreOffer: false, pendingCandidates: [], queue: Promise.resolve() }
    peersRef.current.set(targetId, peer)

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true
        await pc.setLocalDescription()
        await send(targetId, 'description', pc.localDescription!.toJSON())
      } catch (e) {
        console.error('negotiation error:', e)
      } finally {
        peer.makingOffer = false
      }
    }
    pc.onicecandidate = ({ candidate }) => { if (candidate) send(targetId, 'ice-candidate', candidate.toJSON()) }
    pc.ontrack = ({ track, streams }) => {
      const stream = streams[0] ?? new MediaStream([track])
      // 相手がカメラをOFFにしたら（トラックが無くなったら）アバター表示に戻す
      stream.onremovetrack = () => { if (stream.getTracks().length === 0) setRemote(targetId, null) }
      track.onended = () => { if (stream.getTracks().every(t => t.readyState === 'ended')) setRemote(targetId, null) }
      setRemote(targetId, stream)
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') { setRemote(targetId, null); pc.restartIce() }
      if (pc.connectionState === 'closed') setRemote(targetId, null)
    }
    syncTracks(pc)
    // シグナルが1つでも欠けると交渉が止まるので、一定時間つながらなければやり直す
    let stuckSince = 0
    const watchdog = setInterval(async () => {
      if (pc.connectionState === 'closed' || peersRef.current.get(targetId) !== peer) { clearInterval(watchdog); return }
      if (pc.connectionState === 'connected') { stuckSince = 0; return }
      // 自分の offer に返事が来ないまま止まっている → 取り消して出し直す（相手が受け取り損ねた場合の復旧）
      if (pc.signalingState === 'have-local-offer') {
        if (!stuckSince) { stuckSince = Date.now(); return }
        if (Date.now() - stuckSince < 10_000) return
        stuckSince = 0
        try { await pc.setLocalDescription({ type: 'rollback' }) } catch {}
        pc.restartIce()
        return
      }
      stuckSince = 0
      if (pc.signalingState === 'stable') pc.restartIce()
    }, 6_000)
    return peer
  }

  async function handleSignal({ from_user: from, type, payload }: Signal) {
    if (type === 'bye') { closePeer(from); return }
    const peer = ensurePeer(from)
    if (!peer) return
    const { pc } = peer
    if (type === 'description' || type === 'offer' || type === 'answer') {
      const desc = payload as RTCSessionDescriptionInit
      const offerCollision = desc.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable')
      peer.ignoreOffer = !peer.polite && offerCollision
      if (peer.ignoreOffer) return
      // 衝突で取り消した offer への answer が遅れて届いた場合は無視する
      if (desc.type === 'answer' && pc.signalingState !== 'have-local-offer') return
      await pc.setRemoteDescription(desc)
      for (const c of peer.pendingCandidates.splice(0)) await pc.addIceCandidate(c).catch(() => {})
      if (desc.type === 'offer') {
        await pc.setLocalDescription()
        await send(from, 'description', pc.localDescription!.toJSON())
      }
    } else if (type === 'ice-candidate') {
      // 接続情報が先に届いた場合は、相手の description を受け取るまで保留
      if (!pc.remoteDescription) { peer.pendingCandidates.push(payload); return }
      try { await pc.addIceCandidate(payload) } catch (e) { if (!peer.ignoreOffer) console.error('ICE error:', e) }
    }
  }

  // カメラの ON/OFF
  useEffect(() => {
    let cancelled = false
    if (cameraOn) {
      navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false, // no microphone — rule of the room
      }).then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        localStreamRef.current = stream
        setLocalStream(stream)
        peersRef.current.forEach(p => syncTracks(p.pc))
      }).catch(err => console.error('Camera access denied:', err))
    }
    return () => {
      cancelled = true
      if (!localStreamRef.current) return
      localStreamRef.current.getTracks().forEach(t => t.stop())
      localStreamRef.current = null
      setLocalStream(null)
      // 自分の送信だけ止める（他の人の映像の受信は続ける）
      peersRef.current.forEach(p => syncTracks(p.pc))
    }
  }, [cameraOn])

  // カメラONの間は、ルームの全員（後から来た人も含む）に映像を送る
  const memberKey = [...memberIds].sort().join(',')
  useEffect(() => {
    if (localStream) memberIds.forEach(id => { if (id !== userId) ensurePeer(id) })
    // いなくなった人との接続は閉じる
    peersRef.current.forEach((_, id) => { if (!memberIds.includes(id)) closePeer(id) })
  }, [localStream, memberKey, relayStatus])

  function dispatchSignal(s: Signal) {
    // 中継サーバーの準備ができるまでは保留（準備できたら下の effect で処理する）
    if (s.type !== 'bye' && !configRef.current) { heldRef.current.push({ s, at: Date.now() }); return }
    const run = () => handleSignal(s).catch(e => console.error('signal error:', e))
      .finally(() => { supabase.from('webrtc_signals').delete().eq('id', s.id).then(() => {}) })
    // 同じ相手からのシグナルは届いた順に処理する
    const peer = s.type === 'bye' ? peersRef.current.get(s.from_user) : ensurePeer(s.from_user)
    if (peer) peer.queue = peer.queue.then(run)
    else run()
  }

  // メンバーが増えたら、保留していたその人のシグナルを処理する（30秒より古いものは捨てる）
  useEffect(() => {
    if (!configRef.current) return // 中継サーバーの準備ができてから処理する
    const now = Date.now()
    const keep: { s: Signal; at: number }[] = []
    for (const h of heldRef.current) {
      if (now - h.at > 30_000) { supabase.from('webrtc_signals').delete().eq('id', h.s.id).then(() => {}); continue }
      if (memberIds.includes(h.s.from_user)) dispatchSignal(h.s)
      else keep.push(h)
    }
    heldRef.current = keep
  }, [memberKey, relayStatus])

  // シグナルの受信
  useEffect(() => {
    const channel = supabase
      .channel(`webrtc:${roomId}:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'webrtc_signals', filter: `to_user=eq.${userId}`,
      }, ({ new: signal }) => {
        const s = signal as Signal
        // 別の部屋宛てのシグナルは無視する
        if (s.room_id && s.room_id !== roomId) return
        if (s.type === 'bye') { dispatchSignal(s); return }
        // 部屋のメンバー以外からの接続要求には応じない（カメラ映像を勝手に受け取られないように）
        if (!memberIdsRef.current.includes(s.from_user)) {
          heldRef.current = [...heldRef.current.filter(h => Date.now() - h.at < 30_000), { s, at: Date.now() }].slice(-50)
          return
        }
        dispatchSignal(s)
      })
      .subscribe(async (status: string) => {
        if (status !== 'SUBSCRIBED') return
        // 購読を始める前に届いていたシグナル（後から入室した直後など）を拾い直す
        const since = new Date(Date.now() - 60_000).toISOString()
        const { data } = await (supabase as any).from('webrtc_signals')
          .select('id, room_id, from_user, type, payload, created_at')
          .eq('to_user', userId).eq('room_id', roomId).gte('created_at', since)
          .order('created_at', { ascending: true })
        for (const s of (data ?? []) as Signal[]) {
          if (s.type === 'bye' || memberIdsRef.current.includes(s.from_user)) dispatchSignal(s)
          else heldRef.current.push({ s, at: Date.now() })
        }
      })

    return () => {
      supabase.removeChannel(channel)
      peersRef.current.forEach((_, id) => { send(id, 'bye', {}); closePeer(id) })
    }
  }, [roomId, userId])

  return { localStream, remoteStreams, relayStatus }
}
