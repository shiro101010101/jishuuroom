// app/api/me/referral/route.ts — 自分の紹介コードと紹介リンクを返す（ログイン必須）
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { getReferralCode, getReferralUrl } from '@/lib/referral'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const code = await getReferralCode(userId)
  if (!code) return NextResponse.json({ error: '紹介リンクは現在利用できません' }, { status: 503 })
  return NextResponse.json({ code, url: getReferralUrl(code) }, { headers: { 'Cache-Control': 'private, no-store' } })
}
