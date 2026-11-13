import type { NextConfig } from 'next'

// セキュリティヘッダー（クリックジャッキング・MIME スニッフィング・不要な権限の防止など）
// 通信先は自分の Supabase プロジェクトだけに絞る（URL が未設定のビルドでは *.supabase.co）
const supabaseHost = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').host || '*.supabase.co' } catch { return '*.supabase.co' }
})()
// 顔検出ライブラリは、使うバージョンのファイルだけ許可する
const TFJS = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/'
const BLAZEFACE = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/blazeface@0.0.7/'
const csp = [
  "default-src 'self'",
  // 顔検出（tfjs）は jsDelivr から読み込み、WebGL/WASM で動かす
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' ${TFJS} ${BLAZEFACE}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // プロフィール画像は Google・LINE・自分の Supabase Storage だけ
  `img-src 'self' data: blob: https://${supabaseHost} https://lh3.googleusercontent.com https://*.googleusercontent.com https://profile.line-scdn.net https://*.line-scdn.net`,
  "media-src 'self' blob: mediastream:",
  `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} ${TFJS} ${BLAZEFACE} https://tfhub.dev https://www.kaggle.com https://storage.googleapis.com https://fonts.googleapis.com https://fonts.gstatic.com`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com https://access.line.me",
  // Vercel（HTTPS）上だけ。ローカルの http://localhost では有効にしない
  ...(process.env.VERCEL ? ['upgrade-insecure-requests'] : []),
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // カメラは自分のサイトだけ。マイク・位置情報などは使わない
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'profile.line-scdn.net' },
    ],
  },
}

export default nextConfig
