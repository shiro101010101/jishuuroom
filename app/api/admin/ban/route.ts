// app/api/admin/ban/route.ts — 管理者がユーザーを BAN する
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { UUID_RE } from '@/lib/roomAccess'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { targetUserId?: unknown; reason?: unknown } = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid request' }, { status: 400 }) }
  const targetUserId = String(body.targetUserId ?? '')
  const reason = String(body.reason ?? '').trim().slice(0, 300)
  if (!UUID_RE.test(targetUserId) || !reason) {
    return NextResponse.json({ error: 'targetUserId と reason は必須です' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: caller } = await admin.from('profiles').select('role').eq('id', session.user.id).maybeSingle()
  if (caller?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (targetUserId === session.user.id) return NextResponse.json({ error: '自分は BAN できません' }, { status: 400 })

  const { data: target } = await admin.from('profiles').select('provider, provider_id').eq('id', targetUserId).maybeSingle()
  if (!target) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 })

  const { error } = await admin.from('profiles').update({
    is_banned: true, ban_reason: reason, banned_at: new Date().toISOString(), banned_by: session.user.id,
  }).eq('id', targetUserId)
  if (error) {
    console.error('ban error:', error)
    return NextResponse.json({ error: 'BAN できませんでした' }, { status: 500 })
  }
  // 同じ Google/LINE アカウントで作り直せないようにする・部屋から外す
  if (target.provider && target.provider_id) {
    await admin.from('banned_providers').upsert(
      { provider: target.provider, provider_id: target.provider_id, banned_by: session.user.id, reason },
      { onConflict: 'provider,provider_id', ignoreDuplicates: true })
  }
  await admin.from('room_members').delete().eq('user_id', targetUserId)
  return NextResponse.json({ success: true })
}
