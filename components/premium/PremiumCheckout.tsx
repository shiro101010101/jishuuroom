'use client'
// components/premium/PremiumCheckout.tsx — 申し込みフォーム（最終確認）と、お支払いの管理ボタン
// 最終確認画面の表示義務（特定商取引法・2022年改正）：価格・支払時期・契約期間・自動更新・解約方法をボタンの直前に示す
import { useState } from 'react'
import Link from 'next/link'
import styles from './Premium.module.css'

export default function PremiumCheckout({ mode, ready, monthlyYen = 0, yearlyYen = 0 }: {
  mode: 'subscribe' | 'manage'; ready: boolean; monthlyYen?: number; yearlyYen?: number
}) {
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly')
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
  // 18歳未満は月額だけ
  const effInterval = minor ? 'monthly' : interval

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

  const price = effInterval === 'yearly' ? yearlyYen : monthlyYen
  const canSubmit = ready && !busy && agree && age !== null && age >= 13 && (!minor || guardian)

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>お申し込み</div>
      <div className={styles.seg} role="radiogroup" aria-label="プラン">
        <button type="button" role="radio" aria-checked={effInterval === 'monthly'} className={effInterval === 'monthly' ? styles.segOn : ''} onClick={() => setInterval('monthly')}>月額 ¥{monthlyYen.toLocaleString()}</button>
        <button type="button" role="radio" aria-checked={effInterval === 'yearly'} disabled={minor} className={effInterval === 'yearly' ? styles.segOn : ''} onClick={() => setInterval('yearly')}>年額 ¥{yearlyYen.toLocaleString()}</button>
      </div>

      <label className={styles.label}>
        生年月日
        <input type="date" className={styles.input} value={birth} max={new Date().toISOString().slice(0, 10)} onChange={e => setBirth(e.target.value)}/>
      </label>
      <p className={styles.small}>
        生年月日を偽って申し込むと、あとで未成年であることを理由に取り消せなくなることがあります。18歳未満の方は、必ず保護者の方と一緒に申し込んでください。一度入力した生年月日は変更できません。
      </p>
      {age !== null && age < 13 && <p className={styles.error}>13歳未満の方は申し込めません。</p>}
      {minor && age! >= 13 && (
        <label className={styles.check}>
          <input type="checkbox" checked={guardian} onChange={e => setGuardian(e.target.checked)}/>
          <span>保護者の方の同意を得ています（18歳未満の方は、保護者の同意がないと申し込めません。月額プランだけ申し込めます）</span>
        </label>
      )}

      <div className={styles.confirm}>
        <div className={styles.confirmTitle}>お申し込み内容の確認</div>
        <dl>
          <dt>内容</dt><dd>プレミアム（勉強会の主催10個まで・ひみつのピン100人まで・Premiumバッジ）</dd>
          <dt>お支払い金額</dt><dd>¥{price.toLocaleString()}（税込）／{effInterval === 'yearly' ? '1年' : '1か月'}</dd>
          <dt>お支払い方法</dt><dd>クレジットカードなど（決済代行：Stripe）</dd>
          <dt>お支払い時期</dt><dd>今日 初回分を請求し、以後{effInterval === 'yearly' ? '1年' : '1か月'}ごとに自動で更新・請求します</dd>
          <dt>提供時期</dt><dd>決済の完了後、すぐに使えます</dd>
          <dt>契約期間</dt><dd>{effInterval === 'yearly' ? '1年' : '1か月'}（解約するまで同じ期間で自動更新）</dd>
          <dt>解約方法</dt><dd>このページの「お支払いの管理・解約」からいつでも解約できます。次回更新日の前までに解約すれば、次回以降は請求されません。お支払い済みの料金の返金・日割りはありません（法令で認められる場合を除く）</dd>
        </dl>
      </div>

      <label className={styles.check}>
        <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)}/>
        <span><Link href="/terms" target="_blank">利用規約</Link>・<Link href="/tokushoho" target="_blank">特定商取引法に基づく表記</Link>と、上の自動更新の内容に同意します</span>
      </label>

      {error && <p className={styles.error}>{error}</p>}
      <button type="button" className={styles.primary} disabled={!canSubmit}
        onClick={() => go('/api/billing/checkout', { interval: effInterval, birthDate: birth, guardianConsent: guardian, agree })}>
        {busy ? '決済ページへ移動中…' : `¥${price.toLocaleString()} で申し込む（決済ページへ）`}
      </button>
      <p className={styles.small}>決済は Stripe の安全なページで行います。カード番号は当サービスに保存されません。クレジットカードは名義人ご本人の同意を得て使ってください（保護者のカードを使う場合は、保護者の方が操作してください）。</p>
    </div>
  )
}
