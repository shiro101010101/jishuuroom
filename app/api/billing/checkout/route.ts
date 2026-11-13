// app/api/billing/checkout/route.ts — プレミアムの申し込み（Stripe Checkout へ移動する URL を返す）
// 未成年の契約：生年月日を入力してもらい、18 歳未満は「保護者の同意を得た」確認を必須にする（電子商取引準則の考え方）
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe, stripeConfigured } from '@/lib/stripe'
import { legalReady } from '@/lib/legal'
import { getPlan } from '@/lib/premium'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

function ageOn(birth: string, now = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth)
  if (!m) return null
  const [y, mo, d] = [+m[1], +m[2], +m[3]]
  const b = new Date(Date.UTC(y, mo - 1, d))
  if (b.getUTCMonth() !== mo - 1 || b.getUTCDate() !== d || y < 1900 || b > now) return null
  let age = now.getUTCFullYear() - y
  if (now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d)) age--
  return age
}

export async function POST(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return bad('Unauthorized', 401)
  if (!stripeConfigured() || !legalReady()) return bad('プレミアムは準備中です', 503)

  let body: { interval?: unknown; birthDate?: unknown; guardianConsent?: unknown; agree?: unknown } = {}
  try { body = await request.json() } catch {}
  const interval = body.interval === 'yearly' ? 'yearly' : body.interval === 'monthly' ? 'monthly' : null
  if (!interval) return bad('プランを選んでください')
  if (body.agree !== true) return bad('利用規約・特定商取引法に基づく表記・自動更新の内容に同意してください')
  const age = ageOn(String(body.birthDate ?? ''))
  if (age === null) return bad('生年月日を正しく入力してください')
  if (age < 13) return bad('13歳未満の方は申し込めません')
  const minor = age < 18
  if (minor && body.guardianConsent !== true) return bad('18歳未満の方は、保護者の同意が必要です')

  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles').select('display_name, is_banned').eq('id', userId).maybeSingle()
  if (!me || me.is_banned) return bad('Forbidden', 403)
  if ((await getPlan(admin, userId)) === 'premium') return bad('すでにプレミアムです')

  // 同意の記録（後から確認できるように）。テーブルが無いときは申し込ませない
  const { error: consentErr } = await admin.from('billing_consents').insert({
    user_id: userId, birth_date: String(body.birthDate), is_minor: minor, guardian_consent: minor ? true : null, plan_interval: interval,
  })
  if (consentErr) { console.error('billing consent error:', consentErr); return bad('申し込みの準備ができていません（データベースの更新が必要です）', 500) }

  // Stripe の顧客（1 人 1 つ）
  const { data: sub } = await admin.from('subscriptions').select('stripe_customer_id').eq('user_id', userId).maybeSingle()
  let customer = sub?.stripe_customer_id as string | undefined
  if (!customer) {
    const c = await stripe<{ id: string }>('POST', 'customers', { name: me.display_name ?? undefined, metadata: { user_id: userId } })
    customer = c.id
    await admin.from('subscriptions').upsert({ user_id: userId, stripe_customer_id: customer, status: 'incomplete' }, { onConflict: 'user_id' })
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || new URL(request.url).origin
  const price = interval === 'yearly' ? process.env.STRIPE_PRICE_YEARLY! : process.env.STRIPE_PRICE_MONTHLY!
  try {
    const checkout = await stripe<{ url: string }>('POST', 'checkout/sessions', {
      mode: 'subscription',
      customer,
      client_reference_id: userId,
      line_items: [{ price, quantity: 1 }],
      locale: 'ja',
      allow_promotion_codes: 'true',
      subscription_data: { metadata: { user_id: userId } },
      metadata: { user_id: userId },
      success_url: `${origin}/premium?status=success`,
      cancel_url: `${origin}/premium?status=cancel`,
    })
    return NextResponse.json({ url: checkout.url })
  } catch {
    return bad('決済ページを開けませんでした。時間をおいてもう一度お試しください', 502)
  }
}
