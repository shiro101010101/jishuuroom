// app/layout.tsx
import type { Metadata, Viewport } from 'next'
import { SessionProvider } from 'next-auth/react'
import { auth } from '@/auth'
import './globals.css'

export const metadata: Metadata = {
  title: '自習室 JP — みんなで勉強しよう',
  description: '日本人向けオンライン自習室。ポモドーロタイマー、カメラ共有、フレンドチャット、タスク共有機能付き。',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#0a0c10',
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@300;400;500;700&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
