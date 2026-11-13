// hooks/usePresence.ts — 本物のオンライン人数（Supabase Realtime Presence）
// 接続が切れた人は自動で消えるので、閉じ忘れの「幽霊メンバー」も除外できる
'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type PresenceMeta = { user_id: string; room_id: string; studying: boolean }

/**
 * プライベートルームの ID はそのまま流さず、ハッシュにして共有する。
 * 同じ部屋の人どうし（ID を知っている人）だけが「同じ部屋」と判定でき、
 * 部屋の外の人にはどのプライベートルームかが分からない。
 */
export async function presenceRoomKey(roomId: string, isPrivate: boolean, inviteCode?: string | null) {
  if (!isPrivate) return roomId
  // 招待コード（部屋に入れる人しか知らない値）も混ぜるので、部屋 ID だけ知っていても逆算できない
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`jishuuroom:${roomId}:${inviteCode ?? ''}`))
  return 'p:' + Array.from(new Uint8Array(buf).slice(0, 12), b => b.toString(16).padStart(2, '0')).join('')
}

export function usePresence(userId: string, roomId: string, studying: boolean, isPrivate = false, inviteCode: string | null = null) {
  const [metas, setMetas] = useState<(PresenceMeta & { key: string })[]>([])
  const [synced, setSynced] = useState(false)
  const [channel, setChannel] = useState<any>(null)
  const [roomKey, setRoomKey] = useState<string | null>(isPrivate ? null : roomId)

  useEffect(() => {
    let alive = true
    presenceRoomKey(roomId, isPrivate, inviteCode).then(k => { if (alive) setRoomKey(k) })
    return () => { alive = false }
  }, [roomId, isPrivate, inviteCode])

  useEffect(() => {
    if (!roomKey) return
    const supabase = createClient()
    // 非公開チャンネル：ログインしていない人は参加できない（DB 側の realtime.messages ポリシーで制御）
    const ch = supabase.channel('presence:global', { config: { private: true, presence: { key: userId } } })
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<PresenceMeta>()
      // presence のキーと中身の user_id が食い違うもの（なりすまし）は無視する
      const list = Object.entries(state).flatMap(([key, arr]) => arr.map(m => ({ ...m, key })))
        .filter(m => m.key === m.user_id)
      setMetas(list)
      setSynced(true)
    })
    ch.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') await ch.track({ user_id: userId, room_id: roomKey, studying })
    })
    setChannel(ch)
    // removeChannel で退出すれば Presence からも自動で消える（参加前に untrack するとエラーになる）
    return () => { supabase.removeChannel(ch) }
  }, [userId, roomKey])

  // 状態が変わったら送り直す（チャンネルは張り直さない）
  useEffect(() => {
    if (channel && synced && roomKey && channel.state === 'joined') channel.track({ user_id: userId, room_id: roomKey, studying })
  }, [channel, synced, studying])

  return useMemo(() => {
    const online = new Set<string>()
    const studyingNow = new Set<string>()
    const inRoom = new Set<string>()
    // 各ユーザーが今どの部屋にいるか（フレンドの居場所表示・合流に使う。プライベートルームはハッシュ）
    const whereIs = new Map<string, { roomId: string; studying: boolean }>()
    for (const m of metas) {
      online.add(m.user_id)
      whereIs.set(m.user_id, { roomId: m.room_id, studying: !!m.studying || !!whereIs.get(m.user_id)?.studying })
      if (m.studying) studyingNow.add(m.user_id)
      if (roomKey && m.room_id === roomKey) inRoom.add(m.user_id)
    }
    online.add(userId); inRoom.add(userId)
    if (studying) studyingNow.add(userId)
    return { synced, onlineCount: online.size, studyingCount: studyingNow.size, roomUserIds: inRoom, whereIs }
  }, [metas, synced, roomKey, userId, studying])
}
