'use client'
// components/premium/PremiumCheckout.tsx — 申し込みフォーム（最終確認）と、お支払いの管理ボタン
// 最終確認画面の表示義務（特定商取引法・2022年改正）：価格・支払時期・契約期間・自動更新・解約方法をボタンの直前に示す
import { useState } from 'react'
import Link from 'next/link'
import styles from './Premium.module.css'

export default function PremiumCheckout({ mode, ready, monthlyYen = 0, yearlyYen = 0 }: {
  mode: 'subscribe' | 'manage'; ready: boolean; monthlyYen?: number; yearlyYen?: number
}) {
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('yearly')
  const [birth, setBirth] = useState('')
  const [guardian, setGuardian] = useState(false)
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const age = (() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth)
    if (!m) return null
    const now = new Date()
    let a = now.getFullYear() - +m[1]
    if (now.getMonth() + 1 < +m[2] || (now.getMonth() + 1 === +m[2] && now.getDate() < +m[3])) a--
    return a
  })()
  const minor = age !== null && age < 18

  async function go(path: string, body?: unknown) {
    setBusy(true); setError(null)
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.url) throw new Error(d.error ?? 'うまくいきませんでした')
      window.location.href = d.url
    } catch (e) { setError((e as Error).message); setBusy(false) }
  }

  if (mode === 'manage') {
    return (
      <>
        <button type="button" className={styles.ghostBtn} disabled={!ready || busy} onClick={() => go('/api/billing/portal')}>お支払いの管理・解約</button>
        {error && <p className={styles.error}>{error}</p>}
      </>
    )
  }

  const price = interval === 'yearly' ? yearlyYen : monthlyYen
  const canSubmit = ready && !busy && agree && age !== null && age >= 13 && (!minor || guardian)

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>お申し込み</div>
      <div className={styles.seg} role="radiogroup" aria-label="プラン">
        <button type="button" role="radio" aria-checked={interval === 'yearly'} className={interval === 'yearly' ? styles.segOn : ''} onClick={() => setInterval('yearly')}>年額 ¥{yearlyYen.toLocaleString()}</button>
        <button type="button" role="radio" aria-checked={interval === 'monthly'} className={interval === 'monthly' ? styles.segOn : ''} onClick={() => setInterval('monthly')}>月額 ¥{monthlyYen.toLocaleString()}</button>
      </div>

      <label className={styles.label}>
        生年月日
        <input type="date" className={styles.input} value={birth} max={new Date().toISOString().slice(0, 10)} onChange={e => setBirth(e.target.value)}/>
      </label>
      {age !== null && age < 13 && <p className={styles.error}>13歳未満の方は申し込めません。</p>}
      {minor && age! >= 13 && (
        <label className={styles.check}>
          <input type="checkbox" checked={guardian} onChange={e => setGuardian(e.target.checked)}/>
          <span>保護者の方の同意を得ています（18歳未満の方は、保護者の同意がないと申し込めません）</span>
        </label>
      )}

      <div className={styles.confirm}>
        <div className={styles.confirmTitle}>お申し込み内容の確認</div>
        <dl>
          <dt>お支払い金額</dt><dd>¥{price.toLocaleString()}（税込）／{interval === 'yearly' ? '1年' : '1か月'}</dd>
          <dt>お支払い時期</dt><dd>今日 初回分を請求し、以後{interval === 'yearly' ? '1年' : '1か月'}ごとに自動で更新・請求します</dd>
          <dt>契約期間</dt><dd>{interval === 'yearly' ? '1年' : '1か月'}（解約するまで自動更新）</dd>
          <dt>解約方法</dt><dd>このページの「お支払いの管理・解約」からいつでも解約できます。次の更新日以降は請求されません。日割り・返金はありません</dd>
        </dl>
      </div>

      <label className={styles.check}>
        <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)}/>
        <span><Link href="/terms" target="_blank">利用規約</Link>・<Link href="/tokushoho" target="_blank">特定商取引法に基づく表記</Link>と、上の自動更新の内容に同意します</span>
      </label>

      {error && <p className={styles.error}>{error}</p>}
      <button type="button" className={styles.primary} disabled={!canSubmit}
        onClick={() => go('/api/billing/checkout', { interval, birthDate: birth, guardianConsent: guardian, agree })}>
        {busy ? '決済ページへ移動中…' : `¥${price.toLocaleString()} で申し込む（決済ページへ）`}
      </button>
      <p className={styles.small}>決済は Stripe の安全なページで行います。カード番号は当サービスに保存されません。</p>
    </div>
  )
}
