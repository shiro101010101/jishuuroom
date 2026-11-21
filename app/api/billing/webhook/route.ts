// app/api/billing/webhook/route.ts — Stripe からの通知で、課金状態（subscriptions）を更新する
// Stripe ダッシュボード → Webhook に、このURL と次のイベントを登録する：
//   checkout.session.completed / customer.subscription.created / customer.subscription.updated / customer.subscription.deleted
// ・署名（STRIPE_WEBHOOK_SECRET）が合わないものは受け付けない。ログイン不要（middleware で公開）
// ・同じイベントは二度処理しない（stripe_events）
// ・イベントの中身は使わず、毎回 Stripe から最新のサブスクを取り直す（届く順番が前後しても壊れない）
// ・有効なサブスクを、別の（解約済みなどの）サブスクの通知で上書きしない（二重契約のとき有料なのに無料になるのを防ぐ）
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ACTIVE_SUB_STATUSES, stripe, verifyStripeSignature, type StripeSubscription } from '@/lib/stripe'
import { UUID_RE } from '@/lib/roomAccess'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function periodEnd(sub: StripeSubscription): string {
  // 新しい API バージョンでは期間の終わりが items 側にある。どちらにも無ければ失敗にして Stripe に再送させる
  const sec = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end
  if (!sec) throw new Error(`subscription ${sub.id} has no current_period_end`)
  return new Date(sec * 1000).toISOString()
}

async function syncSubscription(subscriptionId: string, fallbackUserId?: string) {
  const sub = await stripe<StripeSubscription>('GET', `subscriptions/${subscriptionId}`)
  const admin = createAdminClient()
  let userId = sub.metadata?.user_id || fallbackUserId
  if (!userId || !UUID_RE.test(userId)) {
    const { data } = await admin.from('subscriptions').select('user_id').eq('stripe_customer_id', sub.customer).maybeSingle()
    userId = data?.user_id as string | undefined
  }
  if (!userId) { console.error('webhook: user not found for customer', sub.customer); return }

  const { data: current } = await admin.from('subscriptions')
    .select('stripe_subscription_id, status, current_period_end').eq('user_id', userId).maybeSingle()
  const currentActive = current && ACTIVE_SUB_STATUSES.has(current.status) && current.current_period_end
    && new Date(current.current_period_end).getTime() > Date.now()
  if (currentActive && current.stripe_subscription_id && current.stripe_subscription_id !== sub.id && !ACTIVE_SUB_STATUSES.has(sub.status)) {
    return // 別の有効なサブスクがあるので、この（有効でない）サブスクでは上書きしない
  }

  const { error } = await admin.from('subscriptions').upsert({
    user_id: userId,
    stripe_customer_id: sub.customer,
    stripe_subscription_id: sub.id,
    status: sub.status,
    plan_interval: sub.items?.data?.[0]?.price?.recurring?.interval ?? null,
    current_period_end: periodEnd(sub),
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
  let event: { id: string; type: string; data: { object: Record<string, unknown> } }
  try { event = JSON.parse(payload) } catch { return NextResponse.json({ error: 'bad payload' }, { status: 400 }) }

  const admin = createAdminClient()
  const { data: seen } = await admin.from('stripe_events').select('id').eq('id', event.id).maybeSingle()
  if (seen) return NextResponse.json({ received: true, duplicate: true })

  try {
    const obj = event.data.object
    switch (event.type) {
      case 'checkout.session.completed':
        if (obj.mode === 'subscription' && typeof obj.subscription === 'string') {
          await syncSubscription(obj.subscription, typeof obj.client_reference_id === 'string' ? obj.client_reference_id : undefined)
        }
        break
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        if (typeof obj.id === 'string') await syncSubscription(obj.id)
        break
    }
  } catch (e) {
    console.error('webhook handling error:', e)
    return NextResponse.json({ error: 'handler failed' }, { status: 500 }) // Stripe が再送する（記録しないので再処理される）
  }
  await admin.from('stripe_events').insert({ id: event.id, type: event.type })
  return NextResponse.json({ received: true })
}
