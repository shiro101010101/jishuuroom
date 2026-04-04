// hooks/useWebRTC.ts
'use client'
import { useEffect, useRef, useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

type PeerConnection = {
  pc: RTCPeerConnection
  stream?: MediaStream
}

export function useWebRTC(roomId: string, userId: string, cameraOn: boolean) {
  const supabase = createClient()
  const localStreamRef = useRef<MediaStream | null>(null)
  const peersRef = useRef<Map<string, PeerConnection>>(new Map())
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)

  // Start/stop local camera
  useEffect(() => {
    if (cameraOn) {
      startCamera()
    } else {
      stopCamera()
    }
    return () => stopCamera()
  }, [cameraOn])

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false, // no microphone — rule of the room
      })
      localStreamRef.current = stream
      setLocalStream(stream)
      // Notify peers about new camera
      announceCameraOn()
    } catch (err) {
      console.error('Camera access denied:', err)
    }
  }

  function stopCamera() {
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    setLocalStream(null)
    // Close all peer connections
    peersRef.current.forEach(({ pc }) => pc.close())
    peersRef.current.clear()
    setRemoteStreams(new Map())
  }

  async function announceCameraOn() {
    // Signal all peers in room that we have a camera
    const { data: members } = await supabase
      .from('room_members')
      .select('user_id')
      .eq('room_id', roomId)
      .neq('user_id', userId)

    members?.forEach(m => {
      createOffer(m.user_id)
    })
  }

  async function createOffer(targetUserId: string) {
    const pc = createPeerConnection(targetUserId)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    await supabase.from('webrtc_signals').insert({
      room_id: roomId,
      from_user: userId,
      to_user: targetUserId,
      type: 'offer',
      payload: { sdp: offer.sdp, type: offer.type },
    })
  }

  function createPeerConnection(targetUserId: string): RTCPeerConnection {
    const existing = peersRef.current.get(targetUserId)
    if (existing) return existing.pc

    const pc = new RTCPeerConnection(ICE_SERVERS)

    // Add local tracks
    localStreamRef.current?.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current!)
    })

    // Receive remote tracks
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams
      setRemoteStreams(prev => new Map(prev.set(targetUserId, remoteStream)))
    }

    // Send ICE candidates
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await supabase.from('webrtc_signals').insert({
          room_id: roomId,
          from_user: userId,
          to_user: targetUserId,
          type: 'ice-candidate',
          payload: event.candidate.toJSON(),
        })
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        peersRef.current.delete(targetUserId)
        setRemoteStreams(prev => {
          const next = new Map(prev)
          next.delete(targetUserId)
          return next
        })
      }
    }

    peersRef.current.set(targetUserId, { pc })
    return pc
  }

  // Listen for incoming WebRTC signals via Supabase Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`webrtc:${roomId}:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'webrtc_signals',
        filter: `to_user=eq.${userId}`,
      }, async (payload) => {
        const signal = payload.new as {
          from_user: string
          type: string
          payload: Record<string, unknown>
        }
        await handleSignal(signal.from_user, signal.type, signal.payload)
        // Clean up processed signal
        await supabase.from('webrtc_signals').delete().eq('id', (payload.new as { id: string }).id)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [roomId, userId])

  async function handleSignal(fromUser: string, type: string, payload: Record<string, unknown>) {
    if (type === 'offer') {
      const pc = createPeerConnection(fromUser)
      await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      await supabase.from('webrtc_signals').insert({
        room_id: roomId,
        from_user: userId,
        to_user: fromUser,
        type: 'answer',
        payload: { sdp: answer.sdp, type: answer.type },
      })
    } else if (type === 'answer') {
      const peer = peersRef.current.get(fromUser)
      if (peer) {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit))
      }
    } else if (type === 'ice-candidate') {
      const peer = peersRef.current.get(fromUser)
      if (peer) {
        await peer.pc.addIceCandidate(new RTCIceCandidate(payload as RTCIceCandidateInit))
      }
    }
  }

  return { localStream, remoteStreams }
}
