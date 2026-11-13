// app/api/billing/portal/route.ts — 解約・支払い方法の変更（Stripe のカスタマーポータルへ）
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe, stripeConfigured } from '@/lib/stripe'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!stripeConfigured()) return NextResponse.json({ error: 'プレミアムは準備中です' }, { status: 503 })
  const { data: sub } = await createAdminClient().from('subscriptions').select('stripe_customer_id').eq('user_id', userId).maybeSingle()
  if (!sub?.stripe_customer_id) return NextResponse.json({ error: 'お申し込みの記録がありません' }, { status: 404 })
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || new URL(request.url).origin
  try {
    const portal = await stripe<{ url: string }>('POST', 'billing_portal/sessions', { customer: sub.stripe_customer_id, return_url: `${origin}/premium`, locale: 'ja' })
    return NextResponse.json({ url: portal.url })
  } catch {
    return NextResponse.json({ error: '管理ページを開けませんでした' }, { status: 502 })
  }
}
