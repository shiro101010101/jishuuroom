// app/premium/page.tsx — プレミアム（料金・できること・申し込み・解約）
import type { Metadata } from 'next'
import Link from 'next/link'
import { auth } from '@/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { SITE } from '@/lib/site'
import { getPlan, LIMITS, PRICES } from '@/lib/premium'
import { stripeConfigured } from '@/lib/stripe'
import { legalReady } from '@/lib/legal'
import PremiumCheckout from '@/components/premium/PremiumCheckout'
import styles from '@/components/premium/Premium.module.css'

export const metadata: Metadata = { title: `プレミアム | ${SITE.name}`, alternates: { canonical: '/premium' } }
export const dynamic = 'force-dynamic'

const FEATURES: { free: string; premium: string; label: string }[] = [
  { label: '自習室への入室・カメラ・タイマー', free: '✓', premium: '✓' },
  { label: '勉強時間の記録・ランキング・連続日数', free: '✓', premium: '✓' },
  { label: 'ピン・勉強仲間・フレンド・メッセージ', free: '✓', premium: '✓' },
  { label: '勉強会への参加・開始前の通知', free: '✓', premium: '✓' },
  { label: '主催できる勉強会（くり返しを含む）', free: `${LIMITS.free.hostedGroups}個まで`, premium: `${LIMITS.premium.hostedGroups}個まで` },
  { label: 'ひみつのピン', free: `${LIMITS.free.secretPins}人まで`, premium: `${LIMITS.premium.secretPins}人まで` },
  { label: 'プロフィールの ✦ Premium バッジ', free: '—', premium: '✓' },
]

export default async function PremiumPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams
  const session = await auth()
  const userId = session?.user?.id ?? null
  let plan: 'free' | 'premium' = 'free'
  let lockedBirth: string | null = null
  let sub: { status: string; current_period_end: string | null; cancel_at_period_end: boolean; plan_interval: string | null } | null = null
  if (userId) {
    const admin = createAdminClient()
    plan = await getPlan(admin, userId)
    const { data } = await admin.from('subscriptions').select('status, current_period_end, cancel_at_period_end, plan_interval, stripe_subscription_id').eq('user_id', userId).maybeSingle()
    sub = data ?? null
    // 以前に申し込みで入力した生年月日（変更不可）
    const { data: c } = await admin.from('billing_consents').select('birth_date').eq('user_id', userId).eq('confirmed', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
    lockedBirth = (c?.birth_date as string | undefined) ?? null
  }
  const ready = stripeConfigured() && legalReady()
  const end = sub?.current_period_end ? new Date(sub.current_period_end) : null

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Link href={userId ? '/lobby' : '/'} className={styles.back}>← {userId ? 'ロビーに戻る' : `${SITE.name} に戻る`}</Link>
        <div className={styles.hero}>
          <div className={styles.badge}>✦ Premium</div>
          <h1 className={styles.title}>毎日の勉強を、仲間と続けやすく</h1>
          <p className={styles.lead}>基本の機能はずっと無料です。プレミアムは、ひみつのピンや勉強会の主催をたくさん使いたい人と、{SITE.name} を応援してくれる人のためのプランです。</p>
        </div>

        {status === 'success' && <div className={styles.notice}>🎉 お申し込みありがとうございます！反映まで数十秒かかることがあります。</div>}
        {status === 'cancel' && <div className={styles.notice}>お申し込みは完了していません。いつでもまたどうぞ。</div>}

        <div className={styles.prices}>
          <div className={styles.price}><div className={styles.priceName}>月額</div><div className={styles.priceVal}>¥{PRICES.monthly.yen.toLocaleString()}<span>/月</span></div></div>
          <div className={`${styles.price} ${styles.priceBest}`}>
            <div className={styles.priceTag}>12か月続けるなら割安</div>
            <div className={styles.priceName}>年額</div><div className={styles.priceVal}>¥{PRICES.yearly.yen.toLocaleString()}<span>/年</span></div>
            <div className={styles.priceSub}>月額を12か月続けた場合（¥{(PRICES.monthly.yen * 12).toLocaleString()}）より ¥{(PRICES.monthly.yen * 12 - PRICES.yearly.yen).toLocaleString()} 安くなります。途中で解約しても返金はありません</div>
          </div>
        </div>

        <table className={styles.table}>
          <thead><tr><th></th><th>無料</th><th>✦ プレミアム</th></tr></thead>
          <tbody>{FEATURES.map(f => <tr key={f.label}><td>{f.label}</td><td>{f.free}</td><td className={styles.pcol}>{f.premium}</td></tr>)}</tbody>
        </table>

        {plan === 'premium' ? (
          <div className={styles.card}>
            <div className={styles.cardTitle}>✦ プレミアムをご利用中です</div>
            <p className={styles.small}>
              {sub?.plan_interval === 'year' ? '年額プラン' : '月額プラン'}
              {end && ` · ${sub?.cancel_at_period_end ? '利用終了日' : '次回の更新日'}：${end.getFullYear()}/${end.getMonth() + 1}/${end.getDate()}`}
            </p>
            <PremiumCheckout mode="manage" ready={ready}/>
          </div>
        ) : !userId ? (
          <div className={styles.card}><Link href="/?next=/lobby" className={styles.primary}>ログインしてはじめる</Link></div>
        ) : !ready ? (
          <div className={styles.card}><div className={styles.cardTitle}>プレミアムは準備中です</div><p className={styles.small}>もうしばらくお待ちください。</p></div>
        ) : (
          <PremiumCheckout mode="subscribe" ready={ready} monthlyYen={PRICES.monthly.yen} yearlyYen={PRICES.yearly.yen} lockedBirth={lockedBirth}/>
        )}

        <p className={styles.foot}>
          <Link href="/tokushoho">特定商取引法に基づく表記</Link> · <Link href="/terms">利用規約</Link> · <Link href="/privacy">プライバシーポリシー</Link>
        </p>
      </main>
    </div>
  )
}
