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

/** 二重契約になったサブスクを解約し、最初の請求を返金する（失敗はログに残し、手作業で対応する） */
async function refundAndCancelDuplicate(subscriptionId: string) {
  try {
    const s = await stripe<{ latest_invoice?: string | null }>('GET', `subscriptions/${subscriptionId}`)
    await stripe('DELETE', `subscriptions/${subscriptionId}`)
    if (s.latest_invoice) {
      const inv = await stripe<{ payment_intent?: string | null; charge?: string | null }>('GET', `invoices/${s.latest_invoice}`)
      if (inv.payment_intent) await stripe('POST', 'refunds', { payment_intent: inv.payment_intent }, { idempotencyKey: `dup-refund-${subscriptionId}` })
      else if (inv.charge) await stripe('POST', 'refunds', { charge: inv.charge }, { idempotencyKey: `dup-refund-${subscriptionId}` })
    }
    console.warn('duplicate subscription canceled and refunded:', subscriptionId)
  } catch (e) {
    console.error('duplicate subscription cleanup failed (要手動対応):', subscriptionId, e)
  }
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
  if (currentActive && current.stripe_subscription_id && current.stripe_subscription_id !== sub.id) {
    if (!ACTIVE_SUB_STATUSES.has(sub.status)) return // 別の有効なサブスクがあるので、この（有効でない）サブスクでは上書きしない
    // 有効なサブスクが 2 つ目 → 二重契約なので、後から来た方をすぐ解約して返金する
    await refundAndCancelDuplicate(sub.id)
    return
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
