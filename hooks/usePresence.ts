// hooks/usePresence.ts — 本物のオンライン人数（Supabase Realtime Presence）
// 接続が切れた人は自動で消えるので、閉じ忘れの「幽霊メンバー」も除外できる
'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type PresenceMeta = { user_id: string; room_id: string; studying: boolean }

export function usePresence(userId: string, roomId: string, studying: boolean) {
  const [metas, setMetas] = useState<PresenceMeta[]>([])
  const [synced, setSynced] = useState(false)
  const [channel, setChannel] = useState<any>(null)

  useEffect(() => {
    const supabase = createClient()
    const ch = supabase.channel('presence:global', { config: { presence: { key: userId } } })
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<PresenceMeta>()
      setMetas(Object.values(state).flat())
      setSynced(true)
    })
    ch.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') await ch.track({ user_id: userId, room_id: roomId, studying })
    })
    setChannel(ch)
    return () => { ch.untrack(); supabase.removeChannel(ch) }
  }, [userId, roomId])

  // 状態が変わったら送り直す（チャンネルは張り直さない）
  useEffect(() => {
    if (channel && synced) channel.track({ user_id: userId, room_id: roomId, studying })
  }, [channel, synced, studying])

  return useMemo(() => {
    const online = new Set<string>()
    const studyingNow = new Set<string>()
    const inRoom = new Set<string>()
    for (const m of metas) {
      online.add(m.user_id)
      if (m.studying) studyingNow.add(m.user_id)
      if (m.room_id === roomId) inRoom.add(m.user_id)
    }
    online.add(userId); inRoom.add(userId)
    if (studying) studyingNow.add(userId)
    return { synced, onlineCount: online.size, studyingCount: studyingNow.size, roomUserIds: inRoom }
  }, [metas, synced, roomId, userId, studying])
}
