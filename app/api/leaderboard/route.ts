// app/api/leaderboard/route.ts — 勉強時間ランキング
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { periodStart, type Period } from '@/lib/studyTime'
import { canEnterRoom } from '@/lib/roomAccess'
import { isExamSlug } from '@/lib/exams'

type Scope = 'global' | 'friends' | 'room' | 'exam'
// 「同じ目標」ランキングで集計対象にする最大人数（RPC に渡す配列が大きくなりすぎないように）
const EXAM_MAX_IDS = 2000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const period = (['day', 'week', 'month'].includes(searchParams.get('period') ?? '') ? searchParams.get('period') : 'day') as Period
  const scope = (['global', 'friends', 'room', 'exam'].includes(searchParams.get('scope') ?? '') ? searchParams.get('scope') : 'global') as Scope
  const roomId = searchParams.get('roomId')

  const admin = createAdminClient()
  let userIds: string[] | null = null

  // 自分の目標（「同じ目標」タブを出すかどうかの判断にも使う）。列がまだ無い DB でも他のランキングは動かす
  const { data: goalRow } = await admin.from('profiles').select('goal_exam').eq('id', userId).maybeSingle()
  const myGoal = isExamSlug(goalRow?.goal_exam) ? goalRow!.goal_exam as string : null

  if (scope === 'friends') {
    const { data } = await admin.from('friendships')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    const ids = new Set<string>([userId])
    data?.forEach((f: any) => { ids.add(f.requester_id); ids.add(f.addressee_id) })
    userIds = Array.from(ids)
  } else if (scope === 'exam') {
    if (!myGoal) {
      return NextResponse.json({ period, scope, since: periodStart(period).toISOString(), myGoal, rows: [], me: null })
    }
    // 同じ目標の人（最近の勉強量が多い順に上限まで）。BAN 中の人は get_leaderboard 側でも除外される
    const { data, error } = await admin.from('profiles').select('id')
      .eq('goal_exam', myGoal).not('is_banned', 'is', true)
      .order('total_study_seconds', { ascending: false, nullsFirst: false })
      .limit(EXAM_MAX_IDS)
    if (error) {
      console.error('leaderboard exam ids:', error.message)
      return NextResponse.json({ error: 'ランキングを取得できませんでした' }, { status: 500 })
    }
    userIds = Array.from(new Set([userId, ...(data ?? []).map((p: any) => p.id as string)]))
  } else if (scope === 'room') {
    if (!roomId || !UUID_RE.test(roomId)) return NextResponse.json({ error: 'roomId required' }, { status: 400 })
    // 入れない部屋（招待されていないプライベートルーム）の在室者は返さない
    const { data: room } = await admin.from('rooms').select('id, name, emoji, is_private, invite_code, created_by').eq('id', roomId).maybeSingle()
    if (!room || !(await canEnterRoom(admin, room, userId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { data } = await admin.from('room_members').select('user_id').eq('room_id', roomId)
    userIds = Array.from(new Set([userId, ...(data ?? []).map((m: any) => m.user_id)]))
  }

  const since = periodStart(period).toISOString()
  const [{ data: rows, error }, { data: mine }] = await Promise.all([
    admin.rpc('get_leaderboard', { p_since: since, p_user_ids: userIds, p_limit: 50 }),
    admin.rpc('get_my_rank', { p_user_id: userId, p_since: since, p_user_ids: userIds }),
  ])
  if (error) {
    console.error('leaderboard error:', error)
    return NextResponse.json({ error: 'ランキングを取得できませんでした（migration_ranking.sql を実行してください）' }, { status: 500 })
  }

  const me = Array.isArray(mine) ? mine[0] : mine
  return NextResponse.json({
    period, scope, since, myGoal,
    rows: (rows ?? []).map((r: any) => ({ ...r, total_seconds: Number(r.total_seconds), rank: Number(r.rank) })),
    me: me ? {
      total_seconds: Number(me.total_seconds ?? 0),
      rank: me.rank == null ? null : Number(me.rank),
      participants: Number(me.participants ?? 0),
    } : null,
  })
}
