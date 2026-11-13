// app/tokushoho/page.tsx — 特定商取引法に基づく表記（中身は環境変数 LEGAL_* から。lib/legal.ts）
import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE } from '@/lib/site'
import { legalInfo } from '@/lib/legal'
import { PRICES } from '@/lib/premium'
import styles from '@/components/legal/Legal.module.css'

export const metadata: Metadata = { title: `特定商取引法に基づく表記 | ${SITE.name}`, alternates: { canonical: '/tokushoho' } }
export const dynamic = 'force-dynamic'

export default function TokushohoPage() {
  const l = legalInfo()
  const unset = '（準備中）'
  const rows: [string, string][] = [
    ['販売事業者', l.seller || unset],
    ['運営責任者', l.manager || l.seller || unset],
    ['所在地', l.address],
    ['電話番号', l.phone],
    ['メールアドレス', l.email || unset],
    ['販売価格', `プレミアム ${PRICES.monthly.label}／${PRICES.yearly.label}（いずれも税込）`],
    ['商品代金以外の必要料金', 'インターネット接続にかかる通信料はお客様のご負担です'],
    ['支払方法', 'クレジットカードなど（決済代行：Stripe）'],
    ['支払時期', '申し込み時に初回分をお支払いいただき、以後は契約期間（1か月または1年）ごとに自動で更新・請求されます'],
    ['提供時期', 'お支払いの完了後、すぐにご利用いただけます'],
    ['解約・返品', 'いつでも「プレミアム」ページの「お支払いの管理」から解約できます。次の更新日以降は請求されません。デジタルサービスの性質上、お支払い済みの料金の返金・日割りはいたしません（法令で認められる場合を除く）'],
    ['動作環境', '最新版の Chrome・Safari・Edge・Firefox（iPhone は iOS 16.4 以降を推奨）'],
  ]
  return (
    <div className={styles.page}>
      <article className={styles.doc}>
        <Link href="/" className={styles.back}>← {SITE.name} に戻る</Link>
        <h1>特定商取引法に基づく表記</h1>
        <table className={styles.table}>
          <tbody>
            {rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
          </tbody>
        </table>
        <p><Link href="/premium">プレミアムについて</Link> · <Link href="/terms">利用規約</Link> · <Link href="/privacy">プライバシーポリシー</Link></p>
      </article>
    </div>
  )
}
