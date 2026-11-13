// app/api/supabase-token/route.ts — ブラウザの Supabase クライアント用トークン
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { mintSupabaseToken } from '@/lib/supabase/token'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // BAN されたユーザーには、ログイン中でも DB 用のトークンを渡さない
  const { data: me } = await createAdminClient().from('profiles').select('is_banned').eq('id', userId).maybeSingle()
  if (!me || me.is_banned) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
  const minted = mintSupabaseToken(userId)
  return NextResponse.json(minted ?? { token: null, expiresAt: null }, { headers: { 'Cache-Control': 'no-store' } })
}
