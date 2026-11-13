// app/api/push/subscribe/route.ts — Web Push の購読登録（POST）・解除（DELETE）
// 購読情報はサーバー専用テーブル（push_subscriptions）に service_role で保存する
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAllowedEndpoint, isValidKey, MAX_SUBS_PER_USER, pushEnabled } from '@/lib/push'

export const dynamic = 'force-dynamic'

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const len = Number(request.headers.get('content-length') ?? 0)
  if (len > 4096) return null
  try {
    const text = await request.text()
    if (text.length > 4096) return null
    const v = JSON.parse(text)
    return v && typeof v === 'object' ? v : null
  } catch { return null }
}

export async function POST(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return bad('Unauthorized', 401)
  if (!pushEnabled()) return bad('通知は現在利用できません', 503)

  const body = await readJson(request)
  const endpoint = body?.endpoint
  const keys = (body?.keys ?? {}) as Record<string, unknown>
  if (!isAllowedEndpoint(endpoint)) return bad('invalid endpoint')
  if (!isValidKey(keys.p256dh, 256) || !isValidKey(keys.auth, 64)) return bad('invalid keys')

  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles').select('is_banned').eq('id', userId).maybeSingle()
  if (!me || me.is_banned) return bad('Forbidden', 403)

  // 1 人 5 端末まで。超える分は古いものから消す（この endpoint 自体は数えない）
  const { data: subs, error: listErr } = await admin.from('push_subscriptions')
    .select('id, endpoint').eq('user_id', userId).order('created_at', { ascending: true })
  if (listErr) { console.error('push list error:', listErr); return bad('保存に失敗しました', 500) }
  const others = (subs ?? []).filter(s => s.endpoint !== endpoint)
  const overflow = others.length - (MAX_SUBS_PER_USER - 1)
  if (overflow > 0) {
    await admin.from('push_subscriptions').delete().in('id', others.slice(0, overflow).map(s => s.id))
  }

  // 同じ端末で別アカウントにログインし直した場合は、新しいアカウントに付け替える
  const { error } = await admin.from('push_subscriptions').upsert(
    { user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    { onConflict: 'endpoint' },
  )
  if (error) { console.error('push upsert error:', error); return bad('保存に失敗しました', 500) }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return bad('Unauthorized', 401)
  const body = await readJson(request)
  const endpoint = body?.endpoint
  if (typeof endpoint !== 'string' || endpoint.length > 1024) return bad('invalid endpoint')
  const { error } = await createAdminClient().from('push_subscriptions')
    .delete().eq('user_id', userId).eq('endpoint', endpoint)
  if (error) { console.error('push delete error:', error); return bad('削除に失敗しました', 500) }
  return NextResponse.json({ ok: true })
}
