// app/api/billing/webhook/route.ts — Stripe からの通知で、課金状態（subscriptions）を更新する
// Stripe ダッシュボード → Webhook に、このURL と次のイベントを登録する：
//   checkout.session.completed / customer.subscription.created / customer.subscription.updated / customer.subscription.deleted
// 署名（STRIPE_WEBHOOK_SECRET）が合わないものは受け付けない。ログイン不要（middleware で公開）
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe, verifyStripeSignature, type StripeSubscription } from '@/lib/stripe'
import { UUID_RE } from '@/lib/roomAccess'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function saveSubscription(sub: StripeSubscription, fallbackUserId?: string) {
  const admin = createAdminClient()
  let userId = sub.metadata?.user_id || fallbackUserId
  if (!userId || !UUID_RE.test(userId)) {
    const { data } = await admin.from('subscriptions').select('user_id').eq('stripe_customer_id', sub.customer).maybeSingle()
    userId = data?.user_id as string | undefined
  }
  if (!userId) { console.error('webhook: user not found for customer', sub.customer); return }
  const { error } = await admin.from('subscriptions').upsert({
    user_id: userId,
    stripe_customer_id: sub.customer,
    stripe_subscription_id: sub.id,
    status: sub.status,
    plan_interval: sub.items?.data?.[0]?.price?.recurring?.interval ?? null,
    // 新しい API バージョンでは期間の終わりが items 側にある。どちらでも読めるようにする
    current_period_end: new Date(((sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end) ?? 0) * 1000).toISOString(),
    cancel_at_period_end: !!sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) throw error
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'not configured' }, { status: 503 })
  const payload = await request.text()
  if (!verifyStripeSignature(payload, request.headers.get('stripe-signature'), secret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }
  let event: { type: string; data: { object: Record<string, unknown> } }
  try { event = JSON.parse(payload) } catch { return NextResponse.json({ error: 'bad payload' }, { status: 400 }) }

  try {
    const obj = event.data.object
    switch (event.type) {
      case 'checkout.session.completed': {
        if (obj.mode !== 'subscription' || typeof obj.subscription !== 'string') break
        const sub = await stripe<StripeSubscription>('GET', `subscriptions/${obj.subscription}`)
        await saveSubscription(sub, typeof obj.client_reference_id === 'string' ? obj.client_reference_id : undefined)
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await saveSubscription(obj as unknown as StripeSubscription)
        break
    }
  } catch (e) {
    console.error('webhook handling error:', e)
    return NextResponse.json({ error: 'handler failed' }, { status: 500 }) // Stripe が再送する
  }
  return NextResponse.json({ received: true })
}
