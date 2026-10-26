// app/layout.tsx
import type { Metadata, Viewport } from 'next'
import { SessionProvider } from 'next-auth/react'
import { auth } from '@/auth'
import { themeInitScript, THEME_COLORS } from '@/components/ThemeToggle'
import ServiceWorker from '@/components/ServiceWorker'
import TimeOfDay from '@/components/TimeOfDay'
import './globals.css'

export const metadata: Metadata = {
  title: 'Study With Me JP | 自習室 — みんなで勉強しよう',
  description: 'Study With Me JP — 日本人向けオンライン自習室。Study Stream・Study Together代替。ポモドーロタイマー、カメラ共有、フレンドチャット機能付き。Join our Japanese study with me community!',
  manifest: '/manifest.json',
  applicationName: '自習室 JP',
  // ホーム画面に追加したとき、ブラウザの枠なしでアプリとして開く（iPhone）
  appleWebApp: { capable: true, title: '自習室 JP', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: THEME_COLORS.dark,
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // ノッチ・ホームバーの下まで描画（余白は safe-area で確保）
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600&family=Zen+Kaku+Gothic+New:wght@300;400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
        <ServiceWorker />
        <TimeOfDay />
      </body>
    </html>
  )
}
