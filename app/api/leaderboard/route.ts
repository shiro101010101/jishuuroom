// app/api/leaderboard/route.ts — 勉強時間ランキング
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { periodStart, type Period } from '@/lib/studyTime'

type Scope = 'global' | 'friends' | 'room'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const period = (['day', 'week', 'month'].includes(searchParams.get('period') ?? '') ? searchParams.get('period') : 'day') as Period
  const scope = (['global', 'friends', 'room'].includes(searchParams.get('scope') ?? '') ? searchParams.get('scope') : 'global') as Scope
  const roomId = searchParams.get('roomId')

  const admin = createAdminClient()
  let userIds: string[] | null = null

  if (scope === 'friends') {
    const { data } = await admin.from('friendships')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    const ids = new Set<string>([userId])
    data?.forEach((f: any) => { ids.add(f.requester_id); ids.add(f.addressee_id) })
    userIds = Array.from(ids)
  } else if (scope === 'room') {
    if (!roomId || !UUID_RE.test(roomId)) return NextResponse.json({ error: 'roomId required' }, { status: 400 })
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
    period, scope, since,
    rows: (rows ?? []).map((r: any) => ({ ...r, total_seconds: Number(r.total_seconds), rank: Number(r.rank) })),
    me: me ? {
      total_seconds: Number(me.total_seconds ?? 0),
      rank: me.rank == null ? null : Number(me.rank),
      participants: Number(me.participants ?? 0),
    } : null,
  })
}
