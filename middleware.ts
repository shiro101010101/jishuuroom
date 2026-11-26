// middleware.ts
import { auth } from '@/auth'
import { NextResponse } from 'next/server'

// ログインなしで見られるパス
const PUBLIC_EXACT = new Set(['/', '/banned', '/terms', '/privacy', '/premium', '/tokushoho', '/account-deletion', '/api/billing/webhook', '/manifest.json', '/sw.js', '/offline.html', '/favicon.ico', '/robots.txt', '/sitemap.xml', '/opengraph-image', '/twitter-image'])
// 前方一致で公開するパス（区切りの / まで含めて判定し、/api/authx のような別パスを巻き込まない）
// /api/cron/ はログインなしで Vercel Cron から呼ばれる（ルートの中で CRON_SECRET を確認）。/r/ は紹介リンク
const PUBLIC_PREFIXES = ['/api/auth/', '/invite/', '/icons/', '/library/', '/_next/', '/exam/', '/r/', '/api/cron/']
// ログイン後の戻り先として許可するのは招待リンクだけ（オープンリダイレクト防止。app/page.tsx と同じ条件）
const SAFE_NEXT_RE = /^\/(invite\/[A-Za-z0-9]{4,32}|room\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/

function isPublicPath(pathname: string) {
  if (PUBLIC_EXACT.has(pathname)) return true
  if (pathname === '/api/auth') return true
  // 見た目確認用のデモ画面は、開発中のパソコンでだけ開ける（本番では常にログインが必要。ページ側も 404 にする）
  // Vercel のプレビュー（PR ごとの試用 URL）でも開ける。本番（VERCEL_ENV=production）では開けない
  const demoAllowed = process.env.NODE_ENV !== 'production' || process.env.VERCEL_ENV === 'preview'
  if (demoAllowed && (pathname === '/demo/room' || pathname === '/demo/lobby' || pathname === '/demo')) return true
  return PUBLIC_PREFIXES.some(p => pathname.startsWith(p))
}

export default auth(async (request) => {
  const { nextUrl } = request
  const { pathname } = nextUrl
  const isLoggedIn = !!request.auth?.user

  // ログイン済みでトップページ → ロビーへ（招待リンクから来た場合はその招待ページへ）
  if (isLoggedIn && pathname === '/') {
    const next = nextUrl.searchParams.get('next')
    const dest = next && SAFE_NEXT_RE.test(next) ? next : '/lobby'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  if (isLoggedIn || isPublicPath(pathname)) return NextResponse.next()

  // 未ログインの API 呼び出しは HTML へのリダイレクトではなく 401 JSON を返す
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 未ログイン → ログインページへ（部屋のリンクから来た場合は、ログイン後にその部屋へ戻す）
  const dest = new URL('/', request.url)
  if (SAFE_NEXT_RE.test(pathname)) dest.searchParams.set('next', pathname)
  return NextResponse.redirect(dest)
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|_vercel/|favicon.ico|manifest.json|sw.js|offline.html|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|ogg|wav|txt|xml|webmanifest)$).*)'],
}
