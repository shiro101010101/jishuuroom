// app/api/profile/view/route.ts — プロフィールカードの追加情報（性別・Instagram・目標・プレミアム）
// 性別は本人が設定していれば誰にでも見せる。Instagram はフレンドかマッチした相手（と本人）にだけ見せる
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { UUID_RE, sharesRoomNow } from '@/lib/roomAccess'
import { getPlan } from '@/lib/premium'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await auth()
  const me = session?.user?.id
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const admin = createAdminClient()
  const { data: viewer } = await admin.from('profiles').select('is_banned').eq('id', me).maybeSingle()
  if (!viewer || viewer.is_banned) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const [{ data: block }, extra, goal, plan] = await Promise.all([
    admin.from('blocks').select('blocker_id').or(`and(blocker_id.eq.${me},blocked_id.eq.${id}),and(blocker_id.eq.${id},blocked_id.eq.${me})`).limit(1),
    admin.from('profiles').select('gender, instagram').eq('id', id).maybeSingle(),
    admin.from('profiles').select('goal_exam').eq('id', id).maybeSingle(),
    getPlan(admin, id),
  ])
  if ((block ?? []).length > 0) return NextResponse.json({ error: 'not available' }, { status: 403 })

  // close：フレンドかマッチ（Instagram を見せる）／related：何かしら関係がある（性別を見せる）
  let close = id === me
  let related = close
  if (!close) {
    const [{ data: friend }, { data: a }, { data: b }, together] = await Promise.all([
      admin.from('friendships').select('id').eq('requester_id', me).eq('addressee_id', id).eq('status', 'accepted').maybeSingle(),
      admin.from('pins').select('id').eq('pinner_id', me).eq('pinned_id', id).maybeSingle(),
      admin.from('pins').select('id, is_secret').eq('pinner_id', id).eq('pinned_id', me).maybeSingle(),
      sharesRoomNow(admin, me, id),
    ])
    close = !!friend || (!!a && !!b)
    // 相手からのひみつのピンは数えない（性別が見えるかどうかで、ひみつのピンがばれないように）
    related = close || !!a || (!!b && !b.is_secret) || together
  }

  const gender = extra.error || !related ? null : (extra.data?.gender as string | null) ?? null
  const instagram = extra.error ? null : (extra.data?.instagram as string | null) ?? null
  return NextResponse.json({
    gender,
    goal: goal.error ? null : (goal.data?.goal_exam as string | null) ?? null,
    premium: plan === 'premium',
    instagram: close ? instagram : null,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
