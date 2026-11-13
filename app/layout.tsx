// app/layout.tsx
import type { Metadata, Viewport } from 'next'
import { SessionProvider } from 'next-auth/react'
import { auth } from '@/auth'
import { themeInitScript, THEME_COLORS } from '@/components/ThemeToggle'
import ServiceWorker from '@/components/ServiceWorker'
import TimeOfDay from '@/components/TimeOfDay'
import AnalyticsRoot from '@/components/analytics/AnalyticsRoot'
import { SITE } from '@/lib/site'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} | ${SITE.tagline}`, template: `%s` },
  description: SITE.description,
  keywords: ['オンライン自習室', '自習室', 'study with me', '勉強 アプリ', '勉強垢', 'ポモドーロ', '勉強時間 記録', '受験勉強', '資格勉強', 'Study Stream'],
  manifest: '/manifest.json',
  applicationName: SITE.name,
  alternates: { canonical: '/' },
  openGraph: { type: 'website', locale: 'ja_JP', siteName: SITE.name, title: `${SITE.name} — ${SITE.tagline}`, description: SITE.description, url: '/' },
  twitter: { card: 'summary_large_image', title: `${SITE.name} — ${SITE.tagline}`, description: SITE.description },
  // ホーム画面に追加したとき、ブラウザの枠なしでアプリとして開く（iPhone）
  appleWebApp: { capable: true, title: SITE.name, statusBarStyle: 'black-translucent' },
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
        {/* アクセス解析（Cookie なし・URL の招待コード等は伏せる）。Vercel 上でだけ読み込む */}
        {process.env.VERCEL && <AnalyticsRoot />}
      </body>
    </html>
  )
}
