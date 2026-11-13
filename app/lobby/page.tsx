// app/lobby/page.tsx — ロビー（ルーム選択・今日の記録・今日のトップ3）
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyStats, periodStart } from '@/lib/studyTime'
import { COMMUNITY_ROOM_ID } from '@/components/lobby/CommunitySession'
import LobbyView from '@/components/lobby/LobbyView'
import { isExamSlug } from '@/lib/exams'
import { getMyPrivateRooms, listPublicRooms } from '@/lib/roomAccess'

export const dynamic = 'force-dynamic'

export default async function LobbyPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) redirect('/')

  const admin = createAdminClient()
  const [{ data: profile }, rooms, { data: members }, stats, { data: top }, privateRooms, goalRes] = await Promise.all([
    admin.from('profiles').select('display_name, avatar_url, bio, is_banned').eq('id', userId).maybeSingle(),
    listPublicRooms(admin),
    admin.from('room_members').select('room_id, status'),
    getMyStats(admin, userId),
    admin.rpc('get_leaderboard', { p_since: periodStart('day').toISOString(), p_user_ids: null, p_limit: 3 }),
    getMyPrivateRooms(admin, userId),
    // 目標は別に読む（migration_exam.sql 未実行で列が無くても、BAN 判定などは止めない）
    admin.from('profiles').select('goal_exam').eq('id', userId).maybeSingle(),
  ])
  if (profile?.is_banned) redirect('/banned')

  const counts: Record<string, { total: number; studying: number }> = {}
  for (const m of members ?? []) {
    counts[m.room_id] ??= { total: 0, studying: 0 }
    counts[m.room_id].total++
    if (m.status === 'studying') counts[m.room_id].studying++
  }
  const name = profile?.display_name ?? session.user?.name ?? 'ゲスト'
  // 列がまだ無い（error）ときはカードを出さない（保存できないため）
  const needsGoal = !goalRes.error && !isExamSlug(goalRes.data?.goal_exam)

  // 「今すぐはじめる」：いちばん人が集まっている公開ルーム（誰もいなければ自由学習）へ、タイマー開始つきで入る
  const { count: sessionCount } = await admin.from('study_sessions').select('id', { count: 'exact', head: true }).eq('user_id', userId)
  const firstTime = (sessionCount ?? 0) === 0
  const busiest = [...(rooms ?? [])].sort((a, b) => (counts[b.id]?.total ?? 0) - (counts[a.id]?.total ?? 0))[0]
  const quickRoom = busiest && (counts[busiest.id]?.total ?? 0) > 0
    ? busiest
    : (rooms ?? []).find(r => r.id === COMMUNITY_ROOM_ID) ?? busiest

  return (
    <LobbyView
      name={name}
      avatarUrl={profile?.avatar_url ?? session.user?.image ?? null}
      bio={profile?.bio ?? null}
      needsGoal={needsGoal}
      stats={stats}
      quickRoom={quickRoom}
      firstTime={firstTime}
      counts={counts}
      invite={invite}
      privateRooms={privateRooms}
      rooms={rooms ?? []}
      top={(top ?? []) as any}
      userId={userId}
    />
  )
}
