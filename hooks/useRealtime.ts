// hooks/useRealtime.ts
'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RoomMember, Message, Friendship, Profile } from '@/lib/supabase/types'

// ─── Room presence ───────────────────────────────────────────
export function useRoomRealtime(roomId: string, userId: string) {
  const supabase  = createClient()
  const [members, setMembers] = useState<(RoomMember & {
    profiles: { display_name: string; avatar_url: string | null }
  })[]>([])
  const studyIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchMembers = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from('room_members')
      .select('*, profiles(display_name, avatar_url, study_streak, subject)')
      .eq('room_id', roomId)
    if (error) console.error('fetchMembers error:', error)
    if (data) setMembers(data as typeof members)
  }, [roomId])

  // Join on mount
  useEffect(() => {
    const joinRoom = async () => {
      const { error } = await (supabase as any).from('room_members').upsert(
        { room_id: roomId, user_id: userId, status: 'studying', camera_on: false },
        { onConflict: 'room_id,user_id' }
      )
      if (error) console.error('❌ join room error:', error)
      else console.log('✅ joined room_members')
      await fetchMembers()
    }
    joinRoom()

    // Increment study_seconds every 60s while page is open
    studyIntervalRef.current = setInterval(async () => {
      await (supabase as any).rpc('update_last_seen')
      // raw SQL increment via RPC
      await supabase
        .from('room_members')
        .update({ study_seconds: (members.find(m => m.user_id === userId)?.study_seconds ?? 0) + 60 })
        .eq('room_id', roomId)
        .eq('user_id', userId)
    }, 60_000)

    // Leave on unmount
    return () => {
      if (studyIntervalRef.current) clearInterval(studyIntervalRef.current)
      (supabase as any).from('room_members')
        .delete()
        .eq('room_id', roomId)
        .eq('user_id', userId)
    }
  }, [roomId, userId])

  // Realtime subscription
  useEffect(() => {
    const ch = supabase
      .channel(`room_members:${roomId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'room_members',
        filter: `room_id=eq.${roomId}`,
      }, () => fetchMembers())
      .subscribe()
    return () => { try { supabase.getChannels().find((c:any)=>c===ch)?.unsubscribe() } catch{} }
  }, [roomId])

  const updateStatus = useCallback(async (
    status: 'studying' | 'break' | 'away',
    currentTask?: string,
    cameraOn?: boolean
  ) => {
    await (supabase as any).from('room_members')
      .update({ status, current_task: currentTask ?? null, camera_on: cameraOn ?? false })
      .eq('room_id', roomId)
      .eq('user_id', userId)
  }, [roomId, userId])

  return { members, updateStatus }
}

// ─── DM messages ─────────────────────────────────────────────
export function useMessages(userId: string, friendId: string) {
  const supabase = createClient()
  const [messages, setMessages] = useState<Message[]>([])

  const fetchMessages = useCallback(async () => {
    if (!friendId) return
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${userId},receiver_id.eq.${friendId}),` +
        `and(sender_id.eq.${friendId},receiver_id.eq.${userId})`
      )
      .order('created_at', { ascending: true })
      .limit(50)
    if (data) setMessages(data)
  }, [userId, friendId])

  useEffect(() => {
    fetchMessages()
    if (!friendId) return
    const ch = supabase
      .channel(`dm:${[userId, friendId].sort().join(':')}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `receiver_id=eq.${userId}`,
      }, (payload) => {
        const msg = payload.new as Message
        if (msg.sender_id === friendId) {
          setMessages(prev => [...prev, msg])
          (supabase as any).from('messages').update({ is_read: true }).eq('id', msg.id)
        }
      })
      .subscribe()
    return () => { try { supabase.getChannels().find((c:any)=>c===ch)?.unsubscribe() } catch{} }
  }, [userId, friendId])

  const sendMessage = useCallback(async (content: string) => {
    if (!friendId) return null
    const { data } = await supabase
      .from('messages')
      .insert({ sender_id: userId, receiver_id: friendId, content })
      .select()
      .single()
    if (data) setMessages(prev => [...prev, data])
    return data
  }, [userId, friendId])

  return { messages, sendMessage }
}

// ─── Friends ─────────────────────────────────────────────────
export function useFriends(userId: string) {
  const supabase = createClient()
  const [friends, setFriends]           = useState<(Friendship & { profiles: Profile })[]>([])
  const [pendingIn, setPendingIn]       = useState<(Friendship & { profiles: Profile })[]>([])
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})

  const fetchFriends = useCallback(async () => {
    // Accepted friends
    const { data: accepted } = await supabase
      .from('friendships')
      .select('*, profiles!friendships_addressee_id_fkey(*)')
      .eq('requester_id', userId)
      .eq('status', 'accepted')
    if (accepted) setFriends(accepted as (Friendship & { profiles: Profile })[])

    // Incoming pending requests (someone sent to me)
    const { data: incoming } = await supabase
      .from('friendships')
      .select('*, profiles!friendships_requester_id_fkey(*)')
      .eq('addressee_id', userId)
      .eq('status', 'pending')
    if (incoming) setPendingIn(incoming as (Friendship & { profiles: Profile })[])

    // Unread message counts
    const { data: unread } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('receiver_id', userId)
      .eq('is_read', false)
    if (unread) {
      const counts: Record<string, number> = {}
      unread.forEach(m => { counts[m.sender_id] = (counts[m.sender_id] || 0) + 1 })
      setUnreadCounts(counts)
    }
  }, [userId])

  useEffect(() => {
    fetchFriends()
    const ch = supabase
      .channel(`friends:${userId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'friendships',
        filter: `addressee_id=eq.${userId}`,
      }, () => fetchFriends())
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `receiver_id=eq.${userId}`,
      }, () => fetchFriends())
      .subscribe()
    return () => { try { supabase.getChannels().find((c:any)=>c===ch)?.unsubscribe() } catch{} }
  }, [userId])

  const sendFriendRequest = useCallback(async (targetId: string) => {
    await (supabase as any).from('friendships').insert({
      requester_id: userId, addressee_id: targetId, status: 'pending',
    })
  }, [userId])

  const acceptFriendRequest = useCallback(async (friendshipId: string) => {
    await (supabase as any).from('friendships').update({ status: 'accepted' }).eq('id', friendshipId)
    // Also create reverse friendship so both sides see each other
    const { data: req } = await supabase
      .from('friendships').select('requester_id,addressee_id').eq('id', friendshipId).single()
    if (req) {
      await (supabase as any).from('friendships').upsert({
        requester_id: req.addressee_id, addressee_id: req.requester_id, status: 'accepted',
      }, { onConflict: 'requester_id,addressee_id' })
    }
    fetchFriends()
  }, [userId, fetchFriends])

  const blockUser = useCallback(async (targetId: string) => {
    await (supabase as any).from('blocks').insert({ blocker_id: userId, blocked_id: targetId })
    await (supabase as any).from('friendships')
      .update({ status: 'blocked' })
      .or(
        `and(requester_id.eq.${userId},addressee_id.eq.${targetId}),` +
        `and(requester_id.eq.${targetId},addressee_id.eq.${userId})`
      )
    fetchFriends()
  }, [userId, fetchFriends])

  const reportUser = useCallback(async (targetId: string, reason: string, details?: string) => {
    await (supabase as any).from('reports').insert({
      reporter_id: userId, reported_id: targetId, reason, details,
    })
  }, [userId])

  return {
    friends, pendingIn, unreadCounts,
    sendFriendRequest, acceptFriendRequest, blockUser, reportUser,
    refetch: fetchFriends,
  }
}
