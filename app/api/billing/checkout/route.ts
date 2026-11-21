// app/api/billing/checkout/route.ts — プレミアムの申し込み（Stripe Checkout へ移動する URL を返す）
// 未成年の契約：生年月日を入力してもらい、18 歳未満は「保護者の同意を得た」確認を必須にする（電子商取引準則の考え方）
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ACTIVE_SUB_STATUSES, stripe, stripeConfigured } from '@/lib/stripe'
import { PRICES } from '@/lib/premium'
import { SITE } from '@/lib/site'
import { legalReady } from '@/lib/legal'
import { getPlan } from '@/lib/premium'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

/** 日本時間の今日を基準にした満年齢。不正な日付なら null */
function ageOn(birth: string, nowMs = Date.now()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth)
  if (!m) return null
  const [y, mo, d] = [+m[1], +m[2], +m[3]]
  const b = new Date(Date.UTC(y, mo - 1, d))
  const j = new Date(nowMs + 9 * 3_600_000) // JST の年月日を UTC のメソッドで読む
  if (b.getUTCMonth() !== mo - 1 || b.getUTCDate() !== d || y < 1900 || b.getTime() > j.getTime()) return null
  let age = j.getUTCFullYear() - y
  if (j.getUTCMonth() + 1 < mo || (j.getUTCMonth() + 1 === mo && j.getUTCDate() < d)) age--
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
  // 未成年は月額だけ（1 人 1 サブスクなので、月 480 円が上限になる）
  if (minor && interval !== 'monthly') return bad('18歳未満の方は月額プランだけ申し込めます')

  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles').select('display_name, is_banned').eq('id', userId).maybeSingle()
  if (!me || me.is_banned) return bad('Forbidden', 403)
  if ((await getPlan(admin, userId)) === 'premium') return bad('すでにプレミアムです')

  // 生年月日は、一度でも契約したことがあれば変えられない（変えたいときはお問い合わせ）。年齢を偽って取り消し対策をすり抜けないように
  // （決済しないまま終わった申し込みの入力では固定しない。打ち間違いで止まらないように）
  const { data: firstConsent } = await admin.from('billing_consents').select('birth_date')
    .eq('user_id', userId).eq('confirmed', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (firstConsent && firstConsent.birth_date !== String(body.birthDate)) {
    return bad('生年月日が以前の申し込みと違います。変更が必要な場合はお問い合わせください')
  }

  // Stripe の顧客（1 人 1 つ）
  const { data: sub } = await admin.from('subscriptions').select('stripe_customer_id').eq('user_id', userId).maybeSingle()
  let customer = sub?.stripe_customer_id as string | undefined
  if (!customer) {
    // 同時に 2 回押されても顧客が 2 つできないように（同じキーなら Stripe は同じ結果を返す）
    const c = await stripe<{ id: string }>('POST', 'customers', { name: me.display_name ?? undefined, metadata: { user_id: userId } }, { idempotencyKey: `customer-${userId}` })
    customer = c.id
    await admin.from('subscriptions').upsert({ user_id: userId, stripe_customer_id: customer, status: 'incomplete' }, { onConflict: 'user_id' })
  }

  // Stripe 側にすでに有効なサブスクがあれば、新しく申し込ませない（二重契約の防止）
  try {
    const list = await stripe<{ data: { status: string }[] }>('GET', 'subscriptions', { customer, status: 'all', limit: 10 })
    if (list.data.some(x => ACTIVE_SUB_STATUSES.has(x.status) || x.status === 'incomplete')) {
      return bad('お申し込みの手続き中か、すでに契約があります。反映まで少しお待ちいただくか「お支払いの管理」をご確認ください', 409)
    }
    // 開いたままの古い決済ページは期限切れにする（2 つのタブで両方支払われて二重契約になるのを防ぐ）
    const open = await stripe<{ data: { id: string }[] }>('GET', 'checkout/sessions', { customer, status: 'open', limit: 10 })
    for (const o of open.data) await stripe('POST', `checkout/sessions/${o.id}/expire`).catch(() => {})
  } catch { return bad('決済の準備ができませんでした。時間をおいてもう一度お試しください', 502) }

  // 同意の記録（後から確認できるように）。テーブルが無いときは申し込ませない
  const { data: consent, error: consentErr } = await admin.from('billing_consents').insert({
    user_id: userId, birth_date: String(body.birthDate), is_minor: minor, guardian_consent: minor ? true : null, plan_interval: interval,
  }).select('id').single()
  if (consentErr || !consent) { console.error('billing consent error:', consentErr); return bad('申し込みの準備ができていません（データベースの更新が必要です）', 500) }


  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || new URL(request.url).origin
  const price = interval === 'yearly' ? process.env.STRIPE_PRICE_YEARLY! : process.env.STRIPE_PRICE_MONTHLY!
  try {
    const checkout = await stripe<{ url: string }>('POST', 'checkout/sessions', {
      mode: 'subscription',
      customer,
      client_reference_id: userId,
      line_items: [{ price, quantity: 1 }],
      locale: 'ja',
      // 表示どおりの金額で請求する（クーポンで初回の金額が変わると、確認画面の表示と食い違うため使わない）
      payment_method_types: ['card'],
      subscription_data: { metadata: { user_id: userId } },
      // 決済ページの申込みボタンの近くにも、自動更新と解約方法を示す（最終確認画面の表示）
      custom_text: { submit: { message: `自動更新の定期契約です。決済の完了後すぐにプレミアムを使えます。${interval === 'yearly' ? '1年' : '1か月'}ごとに¥${(interval === 'yearly' ? PRICES.yearly.yen : PRICES.monthly.yen).toLocaleString()}（税込）を自動で請求します。解約は${SITE.name}の「プレミアム」→「お支払いの管理・解約」から、次回更新日の前までにいつでもできます。解約後も更新日までは使えます。お支払い済みの料金の返金・日割りはありません（法令で認められる場合を除く）。` } },
      // Stripe ダッシュボードに利用規約の URL を登録したら STRIPE_REQUIRE_TOS=1 にする（未登録だとエラーになるため）
      ...(process.env.STRIPE_REQUIRE_TOS === '1' ? { consent_collection: { terms_of_service: 'required' } } : {}),
      metadata: { user_id: userId, consent_id: String(consent.id) },
      success_url: `${origin}/premium?status=success`,
      cancel_url: `${origin}/premium?status=cancel`,
    })
    return NextResponse.json({ url: checkout.url })
  } catch {
    return bad('決済ページを開けませんでした。時間をおいてもう一度お試しください', 502)
  }
}
