// lib/referral.ts — 紹介コード（サーバー専用。クライアントから import しないこと）
// コード = HMAC-SHA256(秘密鍵, ユーザー ID) の先頭 8 文字（16 進数）。
// 秘密鍵を知らない人には、コードからユーザー ID を推測することも、他人のコードを作ることもできない。
// auth.ts 経由で Edge（middleware）にも読み込まれるため、node:crypto ではなく Web Crypto を使う
import { SITE } from '@/lib/site'

/** 紹介 Cookie の名前と有効期間 */
export const REFERRAL_COOKIE = 'jr_ref'
export const REFERRAL_MAX_AGE = 30 * 24 * 60 * 60
/** URL・Cookie で受け付けるコードの形式（DB の check 制約と同じ） */
export const REFERRAL_CODE_RE = /^[A-Za-z0-9]{4,16}$/

function secret() {
  return process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || ''
}

/** ユーザーの紹介コード。秘密鍵が未設定なら null */
export async function getReferralCode(userId: string): Promise<string | null> {
  const key = secret()
  if (!key || !userId) return null
  const enc = new TextEncoder()
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(`referral:v1:${userId}`)))
  return Array.from(sig.slice(0, 4), b => b.toString(16).padStart(2, '0')).join('')
}

/** 紹介リンク（/r/<code>） */
export function getReferralUrl(code: string) {
  return `${SITE.url}/r/${code}`
}

/** 受け取った文字列が紹介コードとして正しい形式なら返す */
export function normalizeReferralCode(v: unknown): string | null {
  return typeof v === 'string' && REFERRAL_CODE_RE.test(v) ? v : null
}
