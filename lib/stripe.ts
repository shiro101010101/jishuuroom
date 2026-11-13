// lib/stripe.ts — Stripe の REST API を直接呼ぶ小さなクライアント（サーバー専用）
// 必要な環境変数：STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY
import { createHmac, timingSafeEqual } from 'node:crypto'

export function stripeConfigured() {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_MONTHLY && process.env.STRIPE_PRICE_YEARLY)
}

/** { a: { b: 1 } } → "a[b]=1"（Stripe のフォーム形式） */
function encode(obj: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (Array.isArray(v)) v.forEach((item, i) => {
      if (item && typeof item === 'object') out.push(...encode(item as Record<string, unknown>, `${key}[${i}]`))
      else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`)
    })
    else if (typeof v === 'object') out.push(...encode(v as Record<string, unknown>, key))
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`)
  }
  return out
}

export async function stripe<T = Record<string, unknown>>(method: 'GET' | 'POST', path: string, params?: Record<string, unknown>): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('Stripe is not configured')
  const body = params ? encode(params).join('&') : undefined
  const url = `https://api.stripe.com/v1/${path}${method === 'GET' && body ? `?${body}` : ''}`
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' },
    body: method === 'POST' ? body : undefined,
    cache: 'no-store',
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error('stripe error:', path, res.status, json?.error?.message)
    throw new Error(json?.error?.message ?? `Stripe error ${res.status}`)
  }
  return json as T
}

/** Webhook の署名を確かめる（Stripe-Signature: t=...,v1=...）。5 分より古いものは受け付けない */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, toleranceSec = 300): boolean {
  if (!header) return false
  const parts = Object.fromEntries(header.split(',').map(kv => kv.split('=') as [string, string]).filter(p => p.length === 2))
  const t = Number(parts.t)
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false
  const expected = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')
  const sigs = header.split(',').filter(p => p.startsWith('v1=')).map(p => p.slice(3))
  return sigs.some(sig => {
    const a = Buffer.from(sig, 'hex'), b = Buffer.from(expected, 'hex')
    return a.length === b.length && timingSafeEqual(a, b)
  })
}

export type StripeSubscription = {
  id: string; customer: string; status: string; current_period_end?: number; cancel_at_period_end: boolean
  metadata?: Record<string, string>
  items?: { data: { current_period_end?: number; price: { id: string; recurring?: { interval: string } } }[] }
}
