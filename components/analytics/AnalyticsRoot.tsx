'use client'
// 計測の土台：Vercel Web Analytics（Cookie なし）＋ ホーム画面への追加（appinstalled）の計測
// URL に含まれる招待コード・部屋 ID・紹介コード・クエリは送る前に伏せる
import { useEffect } from 'react'
import { Analytics } from '@vercel/analytics/next'
import { redactUrl, track } from '@/lib/analytics'

export default function AnalyticsRoot() {
  useEffect(() => {
    const onInstalled = () => track('pwa_install')
    window.addEventListener('appinstalled', onInstalled)
    return () => window.removeEventListener('appinstalled', onInstalled)
  }, [])
  return <Analytics beforeSend={e => ({ ...e, url: redactUrl(e.url) })} />
}
