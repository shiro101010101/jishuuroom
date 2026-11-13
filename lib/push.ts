// lib/push.ts — Web Push の送信（サーバー専用。クライアントから import しないこと）
// VAPID 鍵が未設定なら何もしない（機能ごと無効）
import { sendNotification, setVapidDetails } from 'web-push'

export const MAX_SUBS_PER_USER = 5
export const MAX_ENDPOINT_LEN = 1024

// 送信先として許可するプッシュサービス（任意の URL に POST させる SSRF を防ぐ）
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,                 // Chrome / Edge(一部) / Android
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^[a-z0-9-]+\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,                // Safari / iOS 16.4+
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,     // Edge (Windows)
]

/** 購読の endpoint が https で、既知のプッシュサービスのものか */
export function isAllowedEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > MAX_ENDPOINT_LEN) return false
  try {
    const u = new URL(endpoint)
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && PUSH_HOSTS.some(re => re.test(u.hostname))
  } catch { return false }
}

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/
export function isValidKey(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length >= 8 && v.length <= max && B64URL.test(v)
}

let configured: boolean | null = null
/** VAPID 鍵がそろっていれば web-push を設定して true */
export function pushEnabled(): boolean {
  if (configured !== null) return configured
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!pub || !priv || !subject || !/^(mailto:|https:\/\/)/.test(subject)) return (configured = false)
  try {
    setVapidDetails(subject, pub, priv)
    configured = true
  } catch (e) {
    console.error('VAPID 設定エラー:', e)
    configured = false
  }
  return configured
}

export type PushPayload = { title: string; body: string; url: string; tag: string }
export type StoredSub = { endpoint: string; p256dh: string; auth: string }

/** 1 件送る。戻り値 'gone' は購読が無効（404/410）なので削除すべき */
export async function sendPush(sub: StoredSub, payload: PushPayload): Promise<'ok' | 'gone' | 'error'> {
  if (!pushEnabled() || !isAllowedEndpoint(sub.endpoint)) return 'error'
  try {
    await sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 6 * 60 * 60, urgency: 'normal', topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined, timeout: 10_000 },
    )
    return 'ok'
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) return 'gone'
    console.error('Push 送信エラー:', status ?? e)
    return 'error'
  }
}
