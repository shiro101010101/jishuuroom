// hooks/useTaskSharing.ts
'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Task } from '@/lib/supabase/types'

export type SharedTask = Task & {
  display_name: string
  avatar_url: string | null
  is_shared: boolean
  share_scope: 'private' | 'friends' | 'room'
}

export type StudyPair = {
  id: string
  user_a: string
  user_b: string
  status: 'pending' | 'active' | 'ended'
  requested_by: string
  activated_at: string | null
  partner?: {
    id: string
    display_name: string
    avatar_url: string | null
  }
}

export function useTaskSharing(userId: string, roomId: string) {
  const supabase = createClient()
  const [sharedTasks, setSharedTasks] = useState<SharedTask[]>([])
  const [studyPairs, setStudyPairs] = useState<StudyPair[]>([])
  const [pendingPairRequests, setPendingPairRequests] = useState<StudyPair[]>([])

  // 共有タスクを取得
  const fetchSharedTasks = useCallback(async () => {
    // 自分のフレンドIDを取得
    const { data: friendships } = await supabase
       as any).from('friendships')
      .select('requester_id, addressee_id')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .eq('status', 'accepted')

    const friendIds = (friendships || []).map((f: any) =>
      f.requester_id === userId ? f.addressee_id : f.requester_id
    )

    // 同室メンバーのIDを取得
    const { data: roomMembers } = await supabase
       as any).from('room_members')
      .select('user_id')
      .eq('room_id', roomId)

    const roomMemberIds = (roomMembers || []).map((m: any) => m.user_id)

    // フレンドの共有タスク（friends scope）
    // No friends and no room members → skip query
    if (friendIds.length === 0 && roomMemberIds.length === 0) {
      setSharedTasks([])
      return
    }

    let query = supabase
       as any).from('tasks')
      .select('*, profiles(display_name, avatar_url)')
      .eq('is_shared', true)
      .neq('user_id', userId)
      .eq('completed', false)

    const orParts: string[] = []
    if (friendIds.length > 0) {
      orParts.push(`and(share_scope.eq.friends,user_id.in.(${friendIds.join(',')}))`)
    }
    if (roomMemberIds.length > 0) {
      orParts.push(`and(share_scope.eq.room,user_id.in.(${roomMemberIds.join(',')}))`)
    }
    query = query.or(orParts.join(','))

    const { data: tasks } = await query.order('created_at', { ascending: false })

    if (tasks) {
      setSharedTasks(tasks.map((t: any) => ({
        ...t,
        display_name: (t.profiles as { display_name: string; avatar_url: string | null }).display_name,
        avatar_url: (t.profiles as { display_name: string; avatar_url: string | null }).avatar_url,
      })) as SharedTask[])
    }
  }, [userId, roomId])

  // スタディペアを取得
  const fetchStudyPairs = useCallback(async () => {
    const { data } = await supabase
       as any).from('study_pairs')
      .select('*')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .in('status', ['pending', 'active'])

    if (!data) return

    // パートナー情報を取得
    const partnerIds = data.map((p: any) => p.user_a === userId ? p.user_b : p.user_a)
    const { data: partnerProfiles } = await supabase
       as any).from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', partnerIds.length > 0 ? partnerIds : ['none'])

    const pairs = data.map((p: any) => ({
      ...p,
      partner: partnerProfiles?.find((pr: any) =>
        pr.id === (p.user_a === userId ? p.user_b : p.user_a)
      ),
    })) as StudyPair[]

    setStudyPairs(pairs.filter((p: any) => p.status === 'active'))
    setPendingPairRequests(pairs.filter((p: any) =>
      p.status === 'pending' && p.requested_by !== userId
    ))
  }, [userId])

  // タスクの共有スコープを更新
  const updateTaskShare = useCallback(async (
    taskId: string,
    scope: 'private' | 'friends' | 'room'
  ) => {
    await (supabase as any).from('tasks')
      .update({ is_shared: scope !== 'private', share_scope: scope })
      .eq('id', taskId)
      .eq('user_id', userId)
  }, [userId])

  // ペアリクエストを送る
  const requestPair = useCallback(async (partnerId: string) => {
    await (supabase as any).rpc('request_study_pair', { partner_id: partnerId })
    fetchStudyPairs()
  }, [fetchStudyPairs])

  // ペアを承認する
  const acceptPair = useCallback(async (partnerId: string) => {
    await (supabase as any).rpc('accept_study_pair', { partner_id: partnerId })
    fetchStudyPairs()
  }, [fetchStudyPairs])

  // ペアを終了する
  const endPair = useCallback(async (partnerId: string) => {
    await (supabase as any).rpc('end_study_pair', { partner_id: partnerId })
    fetchStudyPairs()
  }, [fetchStudyPairs])

  useEffect(() => {
    fetchSharedTasks()
    fetchStudyPairs()

    // Realtime: タスク更新を監視
    const taskChannel = supabase
      .channel(`shared_tasks:${roomId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tasks',
      }, () => fetchSharedTasks())
      .subscribe()

    // Realtime: ペアリクエストを監視
    const pairChannel = supabase
      .channel(`study_pairs:${userId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'study_pairs',
        filter: `user_a=eq.${userId}`,
      }, () => fetchStudyPairs())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'study_pairs',
        filter: `user_b=eq.${userId}`,
      }, () => fetchStudyPairs())
      .subscribe()

    return () => {
      (supabase as any).removeChannel(taskChannel)
      (supabase as any).removeChannel(pairChannel)
    }
  }, [userId, roomId])

  return {
    sharedTasks,
    studyPairs,
    pendingPairRequests,
    updateTaskShare,
    requestPair,
    acceptPair,
    endPair,
    refetch: fetchSharedTasks,
  }
}