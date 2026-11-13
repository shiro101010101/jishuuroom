// app/page.tsx
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import LoginClient from '@/components/auth/LoginClient'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'
import TrackOnMount from '@/components/analytics/TrackOnMount'
import { normalizeReferralCode, REFERRAL_COOKIE } from '@/lib/referral'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; r?: string }>
}) {
  const { error, next, r } = await searchParams
  // ログイン後の戻り先は招待リンクだけ許可する（外部サイトへのリダイレクトを防ぐ）
  const safeNext = next && /^\/(invite\/[A-Za-z0-9]{4,32}|room\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(next) ? next : undefined
  const session = await auth()
  if (session?.user) redirect(safeNext ?? '/lobby')
  // 紹介リンク（?r=<code>）で来た人：/r/<code> で Cookie に保存してから、クエリなしのトップに戻す
  // （サーバーコンポーネントでは Cookie を書けないため）
  const ref = normalizeReferralCode(r)
  if (ref) redirect(`/r/${ref}${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ''}`)
  const referred = !!(await cookies()).get(REFERRAL_COOKIE)
  // 「いま◯人が勉強中」（直近10分以内に記録が更新された人数。取れなければ表示しない）
  let liveCount = 0
  try {
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { count } = await createAdminClient().from('study_sessions')
      .select('user_id', { count: 'exact', head: true }).gte('last_heartbeat_at', since)
    liveCount = count ?? 0
  } catch {}
  // 招待リンクから来た人に「誰の・どの部屋か」を見せる（リンクを持っている人にだけ分かる情報）
  let invite: { roomName: string; emoji: string; inviter: string | null } | undefined
  if (safeNext) {
    try {
      const admin = createAdminClient()
      const code = safeNext.startsWith('/invite/') ? safeNext.slice(8).toUpperCase() : null
      const q = admin.from('rooms').select('name, emoji, is_private, created_by')
      const { data: room } = code ? await q.eq('invite_code', code).maybeSingle() : await q.eq('id', safeNext.slice(6)).maybeSingle()
      if (room && (code || !room.is_private)) {
        const { data: owner } = room.created_by
          ? await admin.from('profiles').select('display_name').eq('id', room.created_by).maybeSingle()
          : { data: null }
        invite = { roomName: room.name, emoji: room.emoji ?? '📚', inviter: owner?.display_name ?? null }
      }
    } catch {}
  }
  return (
    <>
      <TrackOnMount event="lp_view" props={{ via: invite ? 'invite' : referred ? 'referral' : 'direct' }} />
      {invite && <TrackOnMount event="invite_landing_view" />}
      <LoginClient error={error} next={safeNext} liveCount={liveCount} invite={invite} />
    </>
  )
}
