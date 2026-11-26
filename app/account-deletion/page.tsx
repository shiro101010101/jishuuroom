// app/account-deletion/page.tsx — 退会（アカウント削除）の方法。ログインなしで見られる
// Google Play は、アプリの外から見られる削除方法のページの URL を必須にしている
import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE } from '@/lib/site'
import styles from '@/components/legal/Legal.module.css'

export const metadata: Metadata = { title: `退会（アカウント削除）の方法 | ${SITE.name}`, alternates: { canonical: '/account-deletion' } }

export default function AccountDeletionPage() {
  return (
    <div className={styles.page}>
      <article className={styles.doc}>
        <Link href="/" className={styles.back}>← {SITE.name} に戻る</Link>
        <h1>退会（アカウント削除）の方法</h1>

        <h2>アプリ・サイトから退会する</h2>
        <p>
          1. {SITE.name} にログインします。<br/>
          2. ロビーで自分のアイコンを押し、プロフィールの編集を開きます。<br/>
          3. 下の「退会する（アカウントを削除）」を押し、確認のため「退会する」と入力して実行します。
        </p>
        <p>退会はすぐに完了します。プレミアムを契約中の場合は、その場で解約され、以後の請求はありません（残りの期間の返金はありません）。</p>

        <h2>削除されるデータ</h2>
        <p>プロフィール（表示名・画像・自己紹介・性別・Instagram）、勉強時間の記録、タスク、フレンド、ピン、メッセージ、勉強会の予定と参加、通知の設定。</p>

        <h2>削除後も残るデータ</h2>
        <p>
          ・有料プランの申し込み時の同意の記録：請求や取消しに関する問い合わせのため、申し込みから5年間（あなたのアカウントとのつながりは外します）<br/>
          ・通報の記録：安全のため（通報した人・された人とのつながりは外します）<br/>
          ・利用停止（BAN）になったログインアカウントの識別子：同じアカウントで作り直せないようにするため
        </p>

        <h2>ログインできない場合</h2>
        <p>{SITE.contact
          ? <>次の窓口に、ログインに使っていたサービス（Google / LINE）と表示名を添えてご連絡ください。本人確認のうえ削除します。<br/>
              <a href={SITE.contact.includes('@') ? `mailto:${SITE.contact}` : SITE.contact}>{SITE.contact}</a></>
          : 'お問い合わせ窓口はサービス内でお知らせします。'}</p>
        <p><Link href="/privacy">プライバシーポリシー</Link></p>
      </article>
    </div>
  )
}
