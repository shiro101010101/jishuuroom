'use client'
// 「明日も忘れないように通知する」カード（ポモドーロ完了後などに置く）
// ・自動で許可ダイアログは出さない（ボタンを押したときだけ）
// ・iPhone / iPad はホーム画面に追加したアプリ（iOS 16.4 以降）でしか通知を受け取れないので、その案内を出す
// ・VAPID 公開鍵が未設定・ブラウザ非対応・購読済みなら何も表示しない
import { useEffect, useRef, useState } from 'react'
import { track } from '@/lib/analytics'
import styles from './PushOptIn.module.css'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
const DISMISS_KEY = 'jr_push_optin_dismissed_at'
const DISMISS_DAYS = 7

type State = 'hidden' | 'ask' | 'ios-install' | 'ios-old' | 'denied' | 'working' | 'done' | 'error'

function isIOS() {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}
function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}
function recentlyDismissed(key: string) {
  try {
    const at = Number(localStorage.getItem(key) ?? 0)
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000
  } catch { return false }
}
function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
async function getRegistration() {
  const existing = await navigator.serviceWorker.getRegistration()
  if (!existing) await navigator.serviceWorker.register('/sw.js')
  return navigator.serviceWorker.ready
}

export default function PushOptIn({ className, onDone, title = '明日も忘れないように通知する', description = '連続記録が途切れそうな日の夜に、1日1回だけそっとお知らせします。', doneText = '通知をオンにしました。明日も一緒にがんばろう！', dismissKey = DISMISS_KEY }: {
  className?: string; onDone?: () => void
  /** 見出し・説明・完了メッセージ（勉強会用などに差し替えられる） */
  title?: string; description?: string; doneText?: string
  /** 「今はしない」を覚えておくキー。置き場所ごとに分ける */
  dismissKey?: string
}) {
  const [state, setState] = useState<State>('hidden')
  const shown = useRef(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!VAPID_PUBLIC_KEY || recentlyDismissed(dismissKey)) return
      const hasSW = 'serviceWorker' in navigator
      const hasPush = hasSW && 'PushManager' in window && 'Notification' in window
      if (isIOS() && !isStandalone()) { if (!cancelled) setState('ios-install'); return }
      if (!hasPush) { if (!cancelled && isIOS()) setState('ios-old'); return }
      if (Notification.permission === 'denied') { if (!cancelled) setState('denied'); return }
      try {
        const reg = await navigator.serviceWorker.getRegistration()
        const sub = await reg?.pushManager.getSubscription()
        if (sub && Notification.permission === 'granted') return // 購読済み
      } catch {}
      if (!cancelled) setState('ask')
    })()
    return () => { cancelled = true }
  }, [dismissKey])

  useEffect(() => {
    if (state !== 'hidden' && !shown.current) { shown.current = true; track('push_prompt_shown') }
  }, [state])

  const dismiss = () => {
    try { localStorage.setItem(dismissKey, String(Date.now())) } catch {}
    setState('hidden')
    onDone?.()
  }

  const enable = async () => {
    setState('working')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setState(permission === 'denied' ? 'denied' : 'ask'); return }
      const reg = await getRegistration()
      const sub = (await reg.pushManager.getSubscription())
        ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }))
      const json = sub.toJSON()
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      })
      if (!res.ok) throw new Error(String(res.status))
      track('push_granted')
      setState('done')
      onDone?.()
    } catch {
      setState('error')
    }
  }

  if (state === 'hidden') return null

  return (
    <div className={`${styles.card} ${className ?? ''}`} role="region" aria-label="通知の設定">
      <div className={styles.icon} aria-hidden>🔔</div>
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {state === 'ask' && <p className={styles.text}>{description}</p>}
        {state === 'working' && <p className={styles.text}>設定しています…</p>}
        {state === 'done' && <p className={styles.text}>{doneText}</p>}
        {state === 'error' && <p className={styles.text}>うまく設定できませんでした。時間をおいてもう一度お試しください。</p>}
        {state === 'denied' && (
          <p className={styles.text}>通知がブロックされています。ブラウザのサイト設定から「通知」を許可すると受け取れます。</p>
        )}
        {state === 'ios-install' && (
          <p className={styles.text}>
            iPhone・iPad では、ホーム画面に追加したアプリから通知を受け取れます（iOS 16.4 以降）。
            Safari の共有ボタン（四角に上向き矢印）→「ホーム画面に追加」で追加し、そこから開いてください。
          </p>
        )}
        {state === 'ios-old' && <p className={styles.text}>通知を受け取るには iOS 16.4 以降へのアップデートが必要です。</p>}
        <div className={styles.actions}>
          {(state === 'ask' || state === 'error') && (
            <button type="button" className={styles.primary} onClick={enable}>通知をオンにする</button>
          )}
          {state !== 'done' && state !== 'working' && (
            <button type="button" className={styles.secondary} onClick={dismiss}>今はしない</button>
          )}
        </div>
      </div>
    </div>
  )
}
