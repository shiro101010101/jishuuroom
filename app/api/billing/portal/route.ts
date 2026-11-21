// app/api/billing/portal/route.ts — 解約・支払い方法の変更（Stripe のカスタマーポータルへ）
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe, stripeConfigured } from '@/lib/stripe'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * このアプリ用のポータル設定（プランの切り替えなし・解約は期間の終了時）。無ければ作る。
 * 切り替えを許すと、未成年が年額に変えられたり、最終確認画面を通らずに契約内容が変わったりするため
 */
async function portalConfigurationId(origin: string): Promise<string> {
  if (process.env.STRIPE_PORTAL_CONFIGURATION) return process.env.STRIPE_PORTAL_CONFIGURATION
  const list = await stripe<{ data: { id: string; active: boolean; metadata?: Record<string, string> }[] }>('GET', 'billing_portal/configurations', { limit: 100 })
  const found = list.data.find(c => c.active && c.metadata?.app === 'jishuuroom-v1')
  if (found) return found.id
  const created = await stripe<{ id: string }>('POST', 'billing_portal/configurations', {
    metadata: { app: 'jishuuroom-v1' },
    business_profile: { headline: 'プレミアムのお支払いの管理', privacy_policy_url: `${origin}/privacy`, terms_of_service_url: `${origin}/terms` },
    features: {
      subscription_cancel: { enabled: 'true', mode: 'at_period_end' },
      subscription_update: { enabled: 'false' },
      payment_method_update: { enabled: 'true' },
      invoice_history: { enabled: 'true' },
    },
  }, { idempotencyKey: 'portal-config-jishuuroom-v1' })
  return created.id
}

export async function POST(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!stripeConfigured()) return NextResponse.json({ error: 'プレミアムは準備中です' }, { status: 503 })
  const { data: sub } = await createAdminClient().from('subscriptions').select('stripe_customer_id').eq('user_id', userId).maybeSingle()
  if (!sub?.stripe_customer_id) return NextResponse.json({ error: 'お申し込みの記録がありません' }, { status: 404 })
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || new URL(request.url).origin
  // 専用の設定が作れないときも、解約の入口は止めない（Stripe の既定の設定で開く）
  let configuration: string | undefined
  try { configuration = await portalConfigurationId(origin) } catch (e) { console.error('portal configuration error:', e) }
  try {
    const portal = await stripe<{ url: string }>('POST', 'billing_portal/sessions', { customer: sub.stripe_customer_id, configuration, return_url: `${origin}/premium`, locale: 'ja' })
    return NextResponse.json({ url: portal.url })
  } catch {
    return NextResponse.json({ error: '管理ページを開けませんでした' }, { status: 502 })
  }
}
