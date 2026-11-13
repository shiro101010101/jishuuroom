// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

// NextAuth のセッションから発行した Supabase 用トークン（期限の1分前に取り直す）
let cached: { token: string | null; expiresAt: number } | null = null
let inflight: Promise<string | null> | null = null

async function getAccessToken(): Promise<string | null> {
  // token が null の場合も expiresAt（5分後）までだけ使い回し、その後は取り直す
  if (cached && cached.expiresAt - (cached.token ? 60_000 : 0) > Date.now()) return cached.token
  inflight ??= fetch('/api/supabase-token', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : { token: null, expiresAt: null }))
    .then(({ token, expiresAt }) => {
      // token が null（サーバー未設定）の場合は anon のまま。5分後に再確認
      cached = { token, expiresAt: expiresAt ?? Date.now() + 5 * 60_000 }
      return token
    })
    .catch(() => null)
    .finally(() => { inflight = null })
  return inflight
}

export function createClient() {
  const client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { accessToken: getAccessToken }
  )
  return withRealtimeAuth(client)
}

// Realtime はトークンを設定し終える前に参加すると、RLS 付きテーブル（フレンド・DM など）の
// 変更通知が届かなくなる。そこで channel.subscribe() を認証完了まで待たせる。
// （createBrowserClient はブラウザでは同じインスタンスを返すので、包むのは一度だけ）
function withRealtimeAuth<T extends ReturnType<typeof createBrowserClient<Database>>>(client: T): T {
  const c = client as any
  if (c.__realtimeAuthWrapped) return client
  c.__realtimeAuthWrapped = true
  const authReady: Promise<unknown> = client.realtime.setAuth().catch(() => {})
  const originalChannel = client.channel.bind(client)
  c.channel = (...args: Parameters<typeof client.channel>) => {
    const ch = originalChannel(...args) as any
    const originalSubscribe = ch.subscribe.bind(ch)
    const originalUnsubscribe = ch.unsubscribe.bind(ch)
    let cancelled = false
    ch.unsubscribe = (...a: any[]) => { cancelled = true; return originalUnsubscribe(...a) }
    ch.subscribe = (...a: any[]) => {
      authReady.then(() => { if (!cancelled) originalSubscribe(...a) })
      return ch
    }
    return ch
  }
  return client
}
