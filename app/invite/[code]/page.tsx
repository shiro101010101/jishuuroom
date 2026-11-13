// app/invite/[code]/page.tsx — 招待リンク。開いた人に部屋の入室権を付けて、その部屋へ移動する
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { INVITE_CODE_RE, grantRoomAccess } from '@/lib/roomAccess'

export const dynamic = 'force-dynamic'

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!INVITE_CODE_RE.test(code)) redirect('/lobby?invite=invalid')

  const session = await auth()
  const userId = session?.user?.id
  // 未ログインならログイン後にこのリンクへ戻ってくる
  if (!userId) redirect(`/?next=${encodeURIComponent(`/invite/${code}`)}`)

  const admin = createAdminClient()
  const { data: room } = await admin.from('rooms').select('id, is_private')
    .eq('invite_code', code.toUpperCase()).maybeSingle()
  if (!room) redirect('/lobby?invite=invalid')

  if (room.is_private) {
    // プロフィールがまだ無い初回ユーザーは、部屋のページで作られてから権限を付ける
    const { data: profile } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle()
    if (profile) await grantRoomAccess(admin, room.id, userId)
    else redirect(`/room/${room.id}?code=${code.toUpperCase()}`)
  }
  redirect(`/room/${room.id}`)
}
