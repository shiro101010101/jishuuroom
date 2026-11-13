// app/r/[code]/route.ts — 紹介リンク（/r/<code>）。紹介コードを Cookie（30 日・httpOnly）に保存してトップへ
// 既に Cookie がある場合は上書きしない（最初に紹介してくれた人を優先）
import { NextResponse, type NextRequest } from 'next/server'
import { normalizeReferralCode, REFERRAL_COOKIE, REFERRAL_MAX_AGE } from '@/lib/referral'

export const dynamic = 'force-dynamic'

// ログイン後の戻り先は招待リンク・部屋だけ（app/page.tsx・middleware.ts と同じ条件）
const SAFE_NEXT_RE = /^\/(invite\/[A-Za-z0-9]{4,32}|room\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const ref = normalizeReferralCode(code)
  const next = request.nextUrl.searchParams.get('next')
  const dest = new URL('/', request.url)
  if (next && SAFE_NEXT_RE.test(next)) dest.searchParams.set('next', next)

  const res = NextResponse.redirect(dest, 307)
  res.headers.set('Cache-Control', 'no-store')
  if (ref && !request.cookies.get(REFERRAL_COOKIE)) {
    res.cookies.set(REFERRAL_COOKIE, ref, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: REFERRAL_MAX_AGE,
    })
  }
  return res
}
