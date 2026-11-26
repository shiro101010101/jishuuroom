// app/api/account/route.ts — 退会（アカウントと保存データの削除）
// アプリストアの必須要件。本人だけが、確認の言葉を入れたときだけ消せる
// ・プレミアムはすぐに解約する（以後の請求を止める。返金はしない＝利用規約どおり）
// ・プロフィール画像を消す
// ・profiles を消すと、ピン・フレンド・メッセージ・勉強記録などは一緒に消える（外部キーの cascade）
// ・申し込み時の同意の記録と通報の記録は、本人とのつながりを外して残す（プライバシーポリシー 6-2）
// ・BAN された人の Google/LINE アカウントは banned_providers に残るので、退会しても作り直せない
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { DELETE_CONFIRM_WORD as CONFIRM_WORD } from '@/lib/account'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function DELETE(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { confirm?: unknown } = {}
  try { body = await request.json() } catch { /* 下で弾く */ }
  if (String(body.confirm ?? '').trim() !== CONFIRM_WORD) {
    return NextResponse.json({ error: `確認のため「${CONFIRM_WORD}」と入力してください` }, { status: 400 })
  }

  const admin = createAdminClient()

  // 1. プレミアムの請求を止める。失敗したら退会もしない（消した後に請求が続くのを防ぐ）
  const { data: sub } = await admin.from('subscriptions').select('stripe_subscription_id, status').eq('user_id', userId).maybeSingle()
  if (sub?.stripe_subscription_id && sub.status !== 'canceled' && process.env.STRIPE_SECRET_KEY) {
    try {
      const s = await stripe<{ status: string }>('GET', `subscriptions/${sub.stripe_subscription_id}`)
      if (s.status !== 'canceled') await stripe('DELETE', `subscriptions/${sub.stripe_subscription_id}`)
    } catch (e) {
      console.error('account delete: cancel subscription failed', e)
      return NextResponse.json({ error: 'プレミアムの解約ができませんでした。時間をおいてもう一度お試しください' }, { status: 502 })
    }
  }

  // 2. プロフィール画像
  try {
    const { data: files } = await admin.storage.from('avatars').list(userId)
    if (files?.length) await admin.storage.from('avatars').remove(files.map(f => `${userId}/${f.name}`))
  } catch (e) { console.error('account delete: avatar cleanup failed', e) }

  // 3. 本体（関連データは cascade で消える）
  const { error } = await admin.from('profiles').delete().eq('id', userId)
  if (error) {
    console.error('account delete error:', error)
    return NextResponse.json({ error: '退会の処理に失敗しました。お問い合わせください' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
