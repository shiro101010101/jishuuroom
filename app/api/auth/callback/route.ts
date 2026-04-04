// app/api/auth/callback/route.ts
// NextAuth handles OAuth callbacks at /api/auth/callback/[provider]
// This file handles any legacy redirects
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { origin } = new URL(request.url)
  return NextResponse.redirect(`${origin}/`)
}
