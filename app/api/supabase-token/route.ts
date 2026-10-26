// app/api/supabase-token/route.ts — ブラウザの Supabase クライアント用トークン
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { mintSupabaseToken } from '@/lib/supabase/token'

export async function GET() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const minted = mintSupabaseToken(userId)
  return NextResponse.json(minted ?? { token: null, expiresAt: null }, { headers: { 'Cache-Control': 'no-store' } })
}
