// lib/supabase/token.ts — サーバー専用
// NextAuth のユーザーを Supabase に「ログイン済み」として伝えるための JWT を発行する。
// これで RLS の auth.uid() が本人の ID になり、他人のデータに触れなくなる。
import { createHmac } from 'node:crypto'

export const SUPABASE_TOKEN_TTL_SEC = 60 * 60

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

/** SUPABASE_JWT_SECRET が未設定なら null（従来どおり anon で動く） */
export function mintSupabaseToken(userId: string): { token: string; expiresAt: number } | null {
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) return null
  const now = Math.floor(Date.now() / 1000)
  const exp = now + SUPABASE_TOKEN_TTL_SEC
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({ sub: userId, role: 'authenticated', aud: 'authenticated', iat: now, exp }))
  const signature = b64url(createHmac('sha256', secret).update(`${header}.${payload}`).digest())
  return { token: `${header}.${payload}.${signature}`, expiresAt: exp * 1000 }
}
