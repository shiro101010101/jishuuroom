// hooks/useInteractions.ts
'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Reaction = {
  id: string
  sender_id: string
  receiver_id: string
  room_id: string
  emoji: string
  created_at: string
  sender?: { display_name: string; avatar_url: string | null }
}

export type Pin = {
  id: string
  pinner_id: string
  pinned_id: string
  created_at: string
}

export type DailyMessage = {
  id: string
  user_id: string
  room_id: string
  content: string
  created_at: string
  date: string
  profiles?: { display_name: string; avatar_url: string | null }
}

const REACTION_EMOJIS = ['👍','🔥','💪','✨','❤️','🎉','😊','🫡']

export function useInteractions(userId: string, roomId: string) {
  const supabase = createClient()
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [pins, setPins] = useState<Pin[]>([])
  const [dailyMessages, setDailyMessages] = useState<DailyMessage[]>([])
  const [myMessage, setMyMessage] = useState('')
  const [reactionCooldowns, setReactionCooldowns] = useState<Record<string, Date>>({})
  const [showPinnedOnly, setShowPinnedOnly] = useState(false)
  const [mutualPinNotif, setMutualPinNotif] = useState<string | null>(null)

  // ── Fetch data ──
  const fetchReactions = useCallback(async () => {
    const { data } = await supabase
      .from('reactions')
      .select('*, sender:profiles!reactions_sender_id_fkey(display_name, avatar_url)')
      .eq('room_id', roomId)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    if (data) setReactions(data as Reaction[])
  }, [roomId])

  const fetchPins = useCallback(async () => {
    const { data } = await supabase
      .from('pins')
      .select('*')
      .eq('pinner_id', userId)
    if (data) setPins(data)
  }, [userId])

  const fetchDailyMessages = useCallback(async () => {
    const { data } = await supabase
      .from('daily_messages')
      .select('*, profiles(display_name, avatar_url)')
      .eq('room_id', roomId)
      .eq('date', new Date().toISOString().split('T')[0])
      .order('created_at', { ascending: false })
    if (data) setDailyMessages(data as DailyMessage[])

    // 自分のメッセージを取得
    const mine = data?.find(m => m.user_id === userId)
    if (mine) setMyMessage(mine.content)
  }, [roomId, userId])

  useEffect(() => {
    fetchReactions()
    fetchPins()
    fetchDailyMessages()

    // Realtime subscriptions
    const ch = supabase
      .channel(`interactions:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions', filter: `room_id=eq.${roomId}` },
        () => fetchReactions())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pins', filter: `pinner_id=eq.${userId}` },
        () => fetchPins())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_messages', filter: `room_id=eq.${roomId}` },
        () => fetchDailyMessages())
      .subscribe()

    // Listen for pins targeting me (for mutual pin notification)
    const pinCh = supabase
      .channel(`pins_to_me:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pins', filter: `pinned_id=eq.${userId}` },
        async (payload) => {
          const { pinner_id } = payload.new as Pin
          // Check if I already pinned them (mutual)
          const { data } = await supabase
            .from('pins')
            .select('id')
            .eq('pinner_id', userId)
            .eq('pinned_id', pinner_id)
            .maybeSingle()
          if (data) {
            // Get pinner name
            const { data: profile } = await supabase
              .from('profiles')
              .select('display_name')
              .eq('id', pinner_id)
              .single()
            if (profile) {
              setMutualPinNotif(`📌 ${profile.display_name}さんとお互いにピンしました！`)
              setTimeout(() => setMutualPinNotif(null), 5000)
            }
          }
        })
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
      supabase.removeChannel(pinCh)
    }
  }, [userId, roomId])

  // ── Send reaction ──
  const sendReaction = useCallback(async (receiverId: string, emoji: string) => {
    // Check cooldown locally
    const cooldown = reactionCooldowns[receiverId]
    if (cooldown && cooldown > new Date()) {
      const mins = Math.ceil((cooldown.getTime() - Date.now()) / 60000)
      return { success: false, error: `あと${mins}分後に送れます` }
    }

    const { data, error } = await supabase.rpc('send_reaction', {
      p_receiver_id: receiverId,
      p_room_id: roomId,
      p_emoji: emoji,
    })

    if (error) return { success: false, error: error.message }

    const result = data as { success: boolean; error?: string; next_available?: string }
    if (result.success) {
      // Set local cooldown
      const nextAvailable = new Date(Date.now() + 60 * 60 * 1000)
      setReactionCooldowns(prev => ({ ...prev, [receiverId]: nextAvailable }))
    }
    return result
  }, [roomId, reactionCooldowns])

  // ── Toggle pin ──
  const togglePin = useCallback(async (targetId: string) => {
    const { data, error } = await supabase.rpc('toggle_pin', { p_target_id: targetId })
    if (error) return
    const result = data as { pinned: boolean; mutual: boolean }
    if (result.mutual) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', targetId)
        .single()
      if (profile) {
        setMutualPinNotif(`📌 ${profile.display_name}さんとお互いにピンしました！`)
        setTimeout(() => setMutualPinNotif(null), 5000)
      }
    }
    fetchPins()
    return result
  }, [fetchPins])

  // ── Save daily message ──
  const saveDailyMessage = useCallback(async (content: string) => {
    if (!content.trim()) return
    await supabase.from('daily_messages').upsert({
      user_id: userId,
      room_id: roomId,
      content: content.trim(),
      date: new Date().toISOString().split('T')[0],
    }, { onConflict: 'user_id,room_id,date' })
    setMyMessage(content.trim())
    fetchDailyMessages()
  }, [userId, roomId, fetchDailyMessages])

  // ── Helpers ──
  const isPinned = useCallback((targetId: string) =>
    pins.some(p => p.pinned_id === targetId), [pins])

  const getReactionsFor = useCallback((receiverId: string) =>
    reactions.filter(r => r.receiver_id === receiverId), [reactions])

  const getCooldownFor = useCallback((receiverId: string) => {
    const cd = reactionCooldowns[receiverId]
    if (!cd || cd <= new Date()) return null
    return cd
  }, [reactionCooldowns])

  const pinnedUserIds = pins.map(p => p.pinned_id)

  return {
    reactions, pins, dailyMessages, myMessage,
    showPinnedOnly, setShowPinnedOnly,
    mutualPinNotif,
    pinnedUserIds,
    REACTION_EMOJIS,
    sendReaction, togglePin, saveDailyMessage,
    isPinned, getReactionsFor, getCooldownFor,
  }
}
