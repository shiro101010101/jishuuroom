// middleware.ts
import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export default auth(async (request) => {
  const { nextUrl } = request
  const session = request.auth
  const isLoggedIn = !!session?.user

  const publicPaths = ['/', '/banned', '/api/auth']
  const isPublic = publicPaths.some(p => nextUrl.pathname.startsWith(p))

  // 未ログイン → ログインページへ
  if (!isLoggedIn && !isPublic) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // ログイン済みでトップページ → ルームへ
  if (isLoggedIn && nextUrl.pathname === '/') {
    return NextResponse.redirect(
      new URL('/room/00000000-0000-0000-0000-000000000001', request.url)
    )
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}