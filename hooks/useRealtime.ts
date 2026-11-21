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
      // 入室したらすぐ「最近アクセス」を更新（ピンや「同じ部屋」の判定が入室直後から効くように）
      ;(supabase as any).rpc('update_last_seen').then(() => {}, () => {})
      const { error } = await (supabase as any).from('room_members').upsert(
        { room_id: roomId, user_id: userId, status: 'studying', camera_on: false },
        { onConflict: 'room_id,user_id' }
      )
      if (error) console.error('❌ join room error:', error)
      else console.log('✅ joined room_members')
      await fetchMembers()
    }
    joinRoom()

    // Auto-leave when tab/window closes (cookie 認証の API 経由)
    const leaveRoom = () => {
      navigator.sendBeacon('/api/room/leave', JSON.stringify({ roomId }))
    }
    window.addEventListener('pagehide', leaveRoom)
    // 戻るボタンで復帰した・別タブを閉じて抜けてしまった場合などに、入室状態を戻す
    const rejoin = () => { if (document.visibilityState === 'visible') joinRoom() }
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) joinRoom() }
    window.addEventListener('pageshow', onShow)
    document.addEventListener('visibilitychange', rejoin)

    // 勉強時間は /api/study/heartbeat が記録する。ここでは最終アクセスだけ更新
    studyIntervalRef.current = setInterval(() => {
      ;(supabase as any).rpc('update_last_seen').then(() => {}, () => {})
    }, 60_000)

    // Leave on unmount
    return () => {
      if (studyIntervalRef.current) clearInterval(studyIntervalRef.current)
      window.removeEventListener('pagehide', leaveRoom)
      window.removeEventListener('pageshow', onShow)
      document.removeEventListener('visibilitychange', rejoin)
      fetch('/api/room/leave', { method: 'POST', body: JSON.stringify({ roomId }), keepalive: true }).catch(() => {})
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

  const fetchMessages = useCallback(async (isCurrent: () => boolean = () => true) => {
    if (!friendId) return
    const { data } = await (supabase as any)
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${userId},receiver_id.eq.${friendId}),` +
        `and(sender_id.eq.${friendId},receiver_id.eq.${userId})`
      )
      .order('created_at', { ascending: false })
      .limit(50)
    if (!isCurrent()) return   // 取得中に相手を切り替えた場合、前の相手のメッセージを出さない
    if (data) setMessages([...(data as Message[])].reverse())
    // チャットを開いた時点で、この相手からの未読をすべて既読にする
    await (supabase as any).from('messages').update({ is_read: true })
      .eq('sender_id', friendId).eq('receiver_id', userId).eq('is_read', false)
  }, [userId, friendId])

  useEffect(() => {
    // 相手が変わったら前の相手とのメッセージを消してから読み直す
    setMessages([])
    let active = true
    fetchMessages(() => active)
    if (!friendId) return () => { active = false }
    const ch = supabase
      .channel(`dm:${[userId, friendId].sort().join(':')}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `receiver_id=eq.${userId}`,
      }, (payload) => {
        const msg = payload.new as Message
        if (msg.sender_id === friendId) {
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
          // チャットを開いている間に届いたものは即既読（クエリは await しないと送信されない）
          ;(supabase as any).from('messages').update({ is_read: true }).eq('id', msg.id).then(() => {})
        }
      })
      .subscribe()
    return () => { active = false; try { supabase.getChannels().find((c:any)=>c===ch)?.unsubscribe() } catch{} }
  }, [userId, friendId])

  const sendMessage = useCallback(async (content: string) => {
    if (!friendId) return null
    const { data, error } = await (supabase as any)
      .from('messages')
      .insert({ sender_id: userId, receiver_id: friendId, content })
      .select()
      .single()
    if (error) console.error('❌ send message error:', error)
    if (data) setMessages(prev => prev.some(m => m.id === data.id) ? prev : [...prev, data as Message])
    return data as Message | null
  }, [userId, friendId])

  return { messages, sendMessage }
}

// ─── Friends ─────────────────────────────────────────────────
export function useFriends(userId: string) {
  const supabase = createClient()
  const [friends, setFriends]           = useState<(Friendship & { profiles: Profile })[]>([])
  const [pendingIn, setPendingIn]       = useState<(Friendship & { profiles: Profile })[]>([])
  // 1 回でも取得できたか（取得前だけサーバー描画時の一覧を使う。0 人になっても古い一覧に戻らないように）
  const [friendsLoaded, setFriendsLoaded] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [newFriendRequest, setNewFriendRequest] = useState<string | null>(null)
  // 自分がブロックしている相手（名前つき）
  const [blocked, setBlocked] = useState<{ id: string; display_name: string; avatar_url: string | null }[]>([])

  const fetchFriends = useCallback(async () => {
    const { data: blockRows } = await (supabase as any)
      .from('blocks')
      .select('blocked_id, profiles!blocks_blocked_id_fkey(display_name, avatar_url)')
      .eq('blocker_id', userId)
    if (blockRows) setBlocked(blockRows.map((b: any) => ({ id: b.blocked_id, display_name: b.profiles?.display_name ?? '', avatar_url: b.profiles?.avatar_url ?? null })))

    // Accepted friends
    const { data: accepted } = await supabase
      .from('friendships')
      .select('*, profiles!friendships_addressee_id_fkey(id, username, display_name, avatar_url, bio, subject, study_streak, total_study_seconds, created_at)')
      .eq('requester_id', userId)
      .eq('status', 'accepted')
    if (accepted) { setFriends(accepted as (Friendship & { profiles: Profile })[]); setFriendsLoaded(true) }
    const friendIds = new Set((accepted ?? []).map((f: any) => f.addressee_id as string))

    // Incoming pending requests (someone sent to me)
    const { data: incoming } = await supabase
      .from('friendships')
      .select('*, profiles!friendships_requester_id_fkey(id, username, display_name, avatar_url, bio, subject, study_streak, total_study_seconds, created_at)')
      .eq('addressee_id', userId)
      .eq('status', 'pending')
    if (incoming) setPendingIn(incoming as (Friendship & { profiles: Profile })[])

    // Unread message counts
    const { data: unread } = await (supabase as any)
      .from('messages')
      .select('sender_id')
      .eq('receiver_id', userId)
      .eq('is_read', false)
    if (unread) {
      const counts: Record<string, number> = {}
      // 開けるチャット（今のフレンド）からの未読だけを数える。ブロック・解除した相手の未読でバッジが消えなくなるのを防ぐ
      ;(unread as { sender_id: string }[]).forEach(m => { if (friendIds.has(m.sender_id)) counts[m.sender_id] = (counts[m.sender_id] || 0) + 1 })
      setUnreadCounts(counts)
    }
  }, [userId])

  useEffect(() => {
    fetchFriends()
    const ch = (supabase as any)
      .channel(`friends:${userId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'friendships',
        filter: `addressee_id=eq.${userId}`,
      }, (payload: any) => {
        console.log('📨 friendship change (addressee):', payload)
        fetchFriends()
        // Notify when new pending request arrives
        if (payload.eventType === 'INSERT' && payload.new?.status === 'pending') {
          setNewFriendRequest(payload.new.requester_id)
        }
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'friendships',
        filter: `requester_id=eq.${userId}`,
      }, (payload: any) => {
        console.log('📨 friendship change (requester):', payload)
        fetchFriends()
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'messages',
        filter: `receiver_id=eq.${userId}`,
      }, () => fetchFriends())  // 受信・既読どちらでも未読数を更新
      .subscribe((status: any) => console.log('friends channel:', status))
    return () => { try { supabase.getChannels().find((c:any)=>c===ch)?.unsubscribe() } catch{} }
  }, [userId])

  const sendFriendRequest = useCallback(async (targetId: string) => {
    // Check if already exists（フレンド済みだと両方向の2行が返るので maybeSingle は使えない）
    const { data: rows } = await (supabase as any).from('friendships')
      .select('id, status')
      .or(`and(requester_id.eq.${userId},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${userId})`)
      .limit(2)
    const existing = (rows ?? []).find((r: any) => r.status === 'accepted') ?? rows?.[0]
    if (existing) {
      console.log('Already friends or pending:', existing.status)
      return existing.status
    }
    const { error } = await (supabase as any).from('friendships').insert({
      requester_id: userId, addressee_id: targetId, status: 'pending',
    })
    if (error) { console.error('❌ friend request error:', error); return 'error' }
    fetchFriends()
    return 'sent'
  }, [userId, fetchFriends])

  const acceptFriendRequest = useCallback(async (friendshipId: string) => {
    const { error: upErr } = await (supabase as any).from('friendships').update({ status: 'accepted' }).eq('id', friendshipId)
    if (upErr) { console.error('accept error:', upErr); return false }
    // Also create reverse friendship so both sides see each other
    const { data: req } = await (supabase as any)
      .from('friendships').select('requester_id,addressee_id').eq('id', friendshipId).single()
    if (req) {
      await (supabase as any).from('friendships').upsert({
        requester_id: req.addressee_id, addressee_id: req.requester_id, status: 'accepted',
      }, { onConflict: 'requester_id,addressee_id' })
    }
    fetchFriends()
    return true
  }, [userId, fetchFriends])

  // 申請を見送る（相手には通知しない）
  const declineFriendRequest = useCallback(async (friendshipId: string) => {
    const { error } = await (supabase as any).from('friendships').delete().eq('id', friendshipId).eq('addressee_id', userId)
    if (error) { console.error('decline error:', error); return false }
    fetchFriends()
    return true
  }, [userId, fetchFriends])

  // フレンドを解除する（両方向の行を消す）
  const removeFriend = useCallback(async (targetId: string) => {
    const { error } = await (supabase as any).from('friendships').delete().or(
      `and(requester_id.eq.${userId},addressee_id.eq.${targetId}),` +
      `and(requester_id.eq.${targetId},addressee_id.eq.${userId})`
    )
    if (error) { console.error('unfriend error:', error); return false }
    fetchFriends()
    return true
  }, [userId, fetchFriends])

  const blockUser = useCallback(async (targetId: string) => {
    const { error } = await (supabase as any).from('blocks').insert({ blocker_id: userId, blocked_id: targetId })
    if (error && error.code !== '23505') { console.error('block error:', error); return false }
    await (supabase as any).from('friendships')
      .update({ status: 'blocked' })
      .or(
        `and(requester_id.eq.${userId},addressee_id.eq.${targetId}),` +
        `and(requester_id.eq.${targetId},addressee_id.eq.${userId})`
      )
    fetchFriends()
    return true
  }, [userId, fetchFriends])

  // ブロック解除：ブロックを消し、ブロック時に止めたフレンド関係も消す（必要なら申請し直す）
  const unblockUser = useCallback(async (targetId: string) => {
    const { error } = await (supabase as any).from('blocks').delete().eq('blocker_id', userId).eq('blocked_id', targetId)
    if (error) { console.error('unblock error:', error); return false }
    await (supabase as any).from('friendships').delete().eq('status', 'blocked').or(
      `and(requester_id.eq.${userId},addressee_id.eq.${targetId}),` +
      `and(requester_id.eq.${targetId},addressee_id.eq.${userId})`
    )
    fetchFriends()
    return true
  }, [userId, fetchFriends])

  const reportUser = useCallback(async (targetId: string, reason: string, details?: string) => {
    await (supabase as any).from('reports').insert({
      reporter_id: userId, reported_id: targetId, reason, details,
    })
  }, [userId])

  return {
    friends, friendsLoaded, pendingIn, unreadCounts,
    sendFriendRequest, acceptFriendRequest, declineFriendRequest, removeFriend, blockUser, unblockUser, blocked, reportUser, newFriendRequest, setNewFriendRequest,
    refetch: fetchFriends,
  }
}
