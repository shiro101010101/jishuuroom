'use client'
// アプリとしてインストールできるように Service Worker を登録する（本番のみ。開発中はキャッシュが邪魔になるので解除）
import { useEffect } from 'react'

export default function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))
      return
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])
  return null
}
