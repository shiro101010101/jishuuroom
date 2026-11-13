'use client'
// components/auth/LoginClient.tsx — トップページ（サービス紹介 + ログイン）
import { signIn } from 'next-auth/react'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import styles from './LoginClient.module.css'
import ThemeToggle from '@/components/ThemeToggle'
import { Icon, type IconName } from '@/components/room/Icons'
import { track } from '@/lib/analytics'

type Lang = 'ja' | 'en'

const COPY = {
  ja: {
    nav: 'ログイン',
    eyebrow: '無料 ・ 30秒で始められる',
    h1a: 'ひとりじゃ|続かない|勉強も、',
    h1b: 'みんなとなら|続く。',
    sub: 'カメラをONにして、全国の仲間や友達と同じ部屋で集中。マイクは使わないから、静かな図書館みたいに勉強できます。',
    live: (n: number) => `いま ${n}人 が勉強中`,
    invite: '友達から招待されています。ログインするとそのまま部屋に入れます。',
    loginWith: 'ログインして始める',
    google: 'Googleでログイン',
    line: 'LINEでログイン',
    loading: '接続中…',
    error: 'ログインに失敗しました。もう一度お試しください。',
    banned: 'このアカウントは利用規約違反のため利用停止されています。',
    agree: ['ログインすると', '利用規約', 'と', 'プライバシーポリシー', 'に同意したものとみなします。'],
    featTitle: '続けられる仕組みが、ぜんぶ入り',
    features: [
      { icon: 'camera', t: 'カメラで一緒に勉強', d: '誰かが見ている適度な緊張感。マイクなし・会話なしで、集中だけを共有します。' },
      { icon: 'users', t: '友達だけの部屋', d: 'ボタンひとつで部屋を作って、LINEで招待。フレンドがどの部屋にいるかも見えて、すぐ合流できます。' },
      { icon: 'trophy', t: 'ランキングと連続記録', d: '勉強時間は自動で記録。全体・フレンド・部屋ごとのランキングと🔥連続日数でやる気が続きます。' },
      { icon: 'timer', t: 'ポモドーロ＆環境音', d: '25分集中・5分休憩のタイマーに、雨音やカフェの音。自分のペースにも変えられます。' },
      { icon: 'download', t: '記録カードでシェア', d: '今日の勉強時間をきれいな画像に。勉強垢への投稿や友達への報告に使えます。' },
      { icon: 'shield', t: '安心の安全設計', d: 'ブロック・通報・離席の自動検知。メッセージはフレンドどうしだけ。映像は保存されず、顔の検出も端末の中だけで行います。' },
    ] as { icon: IconName; t: string; d: string }[],
    stepsTitle: '始め方はかんたん',
    steps: [
      { t: 'ログイン', d: 'GoogleかLINEで、登録30秒。' },
      { t: '部屋を選ぶ', d: '受験・資格・プログラミングなど。友達だけの部屋も作れます。' },
      { t: 'タイマーをスタート', d: 'カメラはON/OFF自由。あとは集中するだけ。' },
    ],
    faqTitle: 'よくある質問',
    faq: [
      { q: '無料で使えますか？', a: 'はい。自習室・タイマー・ランキング・フレンド機能はすべて無料で使えます。' },
      { q: 'カメラは必ずONにしないといけませんか？', a: 'いいえ。OFFのままでも参加できます。映像は録画・保存されません。' },
      { q: '声や生活音は聞こえてしまいますか？', a: 'マイクは使わないので、音声は一切送られません。' },
      { q: 'スマホでも使えますか？', a: 'はい。スマホのブラウザで開くだけで使えます。ホーム画面に追加すればアプリのように起動できます。' },
      { q: '知らない人から連絡が来ませんか？', a: 'メッセージを送れるのはフレンドになった人だけです。困ったときはブロック・通報ができます。' },
    ],
    ctaTitle: '今日から、いっしょに。',
    ctaBtn: '無料で始める',
    terms: '利用規約', privacy: 'プライバシーポリシー',
  },
  en: {
    nav: 'Sign in',
    eyebrow: 'Free · start in 30 seconds',
    h1a: 'Hard to study alone? ',
    h1b: 'Study together.',
    sub: 'Turn on your camera and focus in the same room with friends and learners across Japan. No microphones — quiet like a library.',
    live: (n: number) => `${n} studying now`,
    invite: 'A friend invited you. Sign in to join their room.',
    loginWith: 'Sign in to start',
    google: 'Continue with Google',
    line: 'Continue with LINE',
    loading: 'Connecting…',
    error: 'Login failed. Please try again.',
    banned: 'This account has been suspended for violating the terms.',
    agree: ['By signing in you agree to the ', 'Terms', ' and ', 'Privacy Policy', '.'],
    featTitle: 'Everything that keeps you going',
    features: [
      { icon: 'camera', t: 'Study on camera', d: 'Gentle accountability. No mic, no talking — just shared focus.' },
      { icon: 'users', t: 'Friends-only rooms', d: 'Create a room, invite friends via LINE, and see where your friends are studying.' },
      { icon: 'trophy', t: 'Rankings & streaks', d: 'Study time is recorded automatically. Global, friend and room rankings plus 🔥 streaks.' },
      { icon: 'timer', t: 'Pomodoro & ambience', d: '25/5 focus timer with rain and café sounds, or your own pace.' },
      { icon: 'download', t: 'Share your record', d: 'Turn today\'s study time into a beautiful image to post or send.' },
      { icon: 'shield', t: 'Safety first', d: 'Block, report and away detection. Only friends can message you. Video is never stored.' },
    ] as { icon: IconName; t: string; d: string }[],
    stepsTitle: 'How it works',
    steps: [
      { t: 'Sign in', d: 'Google or LINE, in 30 seconds.' },
      { t: 'Pick a room', d: 'Exams, certifications, coding… or make a friends-only room.' },
      { t: 'Start the timer', d: 'Camera on or off. Then just focus.' },
    ],
    faqTitle: 'FAQ',
    faq: [
      { q: 'Is it free?', a: 'Yes. Rooms, timer, rankings and friends are all free.' },
      { q: 'Do I have to turn on my camera?', a: 'No. Video is never recorded or stored.' },
      { q: 'Can others hear me?', a: 'No microphone is used. No audio is sent.' },
      { q: 'Does it work on phones?', a: 'Yes, right in your mobile browser. Add it to your home screen to use it like an app.' },
      { q: 'Can strangers message me?', a: 'Only friends can message you. You can block or report anytime.' },
    ],
    ctaTitle: 'Start studying together today.',
    ctaBtn: 'Get started free',
    terms: 'Terms', privacy: 'Privacy',
  },
}

export default function LoginClient({ error, next, liveCount = 0, invite }: {
  error?: string; next?: string; liveCount?: number
  invite?: { roomName: string; emoji: string; inviter: string | null }
}) {
  const [loading, setLoading] = useState<'google' | 'line' | null>(null)
  const [lang, setLang] = useState<Lang>('ja')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('lang')
      if (saved === 'ja' || saved === 'en') setLang(saved)
    } catch {}
  }, [])

  const toggleLang = () => {
    const nextLang = lang === 'ja' ? 'en' : 'ja'
    setLang(nextLang)
    try { localStorage.setItem('lang', nextLang) } catch {}
  }

  async function loginWith(provider: 'google' | 'line') {
    setLoading(provider)
    track('login_click', { provider })
    // 招待リンクから来た場合はログイン後にその部屋へ
    await signIn(provider, { callbackUrl: next ?? '/lobby' })
  }

  const t = COPY[lang]

  const loginCard = (
    <div className={styles.card} id="login">
      <div className={styles.logo}>
        <div className={styles.logoIcon}>自</div>
        <div className={styles.logoText}>{lang === 'ja' ? '自習室 JP' : 'Study With Me JP'}</div>
      </div>
      {next && (invite
        ? <div className={styles.inviteNote}>
            🤝 {lang === 'ja'
              ? <>{invite.inviter ? <><b>{invite.inviter}</b>さんの</> : ''}<b>「{invite.emoji} {invite.roomName}」</b>に招待されています。ログインするとそのまま入室できます。</>
              : <>You're invited to <b>{invite.emoji} {invite.roomName}</b>{invite.inviter ? <> by <b>{invite.inviter}</b></> : ''}. Sign in to join.</>}
          </div>
        : <div className={styles.inviteNote}>🤝 {t.invite}</div>)}
      {error && <div className={styles.errorNote} role="alert">⚠️ {error === 'banned' ? t.banned : t.error}</div>}
      <div className={styles.divider}><span>{t.loginWith}</span></div>
      <div className={styles.buttons}>
        <button className={styles.googleBtn} onClick={() => loginWith('google')} disabled={!!loading}>
          {loading === 'google' ? t.loading : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {t.google}
            </>
          )}
        </button>
        <button className={styles.lineBtn} onClick={() => loginWith('line')} disabled={!!loading}>
          {loading === 'line' ? t.loading : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
              </svg>
              {t.line}
            </>
          )}
        </button>
      </div>
      <p className={styles.notice}>
        {t.agree[0]}<Link href="/terms">{t.agree[1]}</Link>{t.agree[2]}<Link href="/privacy">{t.agree[3]}</Link>{t.agree[4]}
      </p>
    </div>
  )

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <div className={styles.brand}><span className={styles.brandMark}>自</span>{lang === 'ja' ? '自習室 JP' : 'Study With Me JP'}</div>
        <div className={styles.navRight}>
          <ThemeToggle />
          <button className={styles.navBtn} onClick={toggleLang}>{lang === 'ja' ? 'EN' : '日本語'}</button>
          <a className={`${styles.navBtn} ${styles.navCta}`} href="#login">{t.nav}</a>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <div className={styles.eyebrow}>{t.eyebrow}</div>
            {/* 言葉の途中で改行しないよう、文節ごとにまとめる（「|」が区切り） */}
            <h1 className={styles.h1}>
              {t.h1a.split('|').map(p => <span key={p} className={styles.phrase}>{p}</span>)}<br/>
              <span className={styles.h1Accent}>{t.h1b.split('|').map(p => <span key={p} className={styles.phrase}>{p}</span>)}</span>
            </h1>
            <p className={styles.sub}>{t.sub}</p>
            {liveCount > 0 && <div className={styles.live}><i/> {t.live(liveCount)}</div>}
          </div>
          <div className={styles.heroCard}>{loginCard}</div>
          <div className={styles.heroMock}><RoomMock lang={lang}/></div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>{t.featTitle}</h2>
          <div className={styles.featGrid}>
            {t.features.map(f => (
              <div key={f.t} className={styles.feat}>
                <div className={styles.featIcon}><Icon name={f.icon} size={20}/></div>
                <div className={styles.featT}>{f.t}</div>
                <div className={styles.featD}>{f.d}</div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>{t.stepsTitle}</h2>
          <ol className={styles.steps}>
            {t.steps.map((s, i) => (
              <li key={s.t} className={styles.step}>
                <span className={styles.stepNum}>{i + 1}</span>
                <div><div className={styles.featT}>{s.t}</div><div className={styles.featD}>{s.d}</div></div>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>{t.faqTitle}</h2>
          <div className={styles.faq}>
            {t.faq.map(f => (
              <details key={f.q} className={styles.faqItem}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={`${styles.section} ${styles.cta}`}>
          <h2 className={styles.ctaTitle}>{t.ctaTitle}</h2>
          <a className={styles.ctaBtn} href="#login">{t.ctaBtn}</a>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} {lang === 'ja' ? '自習室 JP' : 'Study With Me JP'}</span>
        <nav><Link href="/terms">{t.terms}</Link><Link href="/privacy">{t.privacy}</Link></nav>
      </footer>
    </div>
  )
}

/** ヒーローに置く「自習室の様子」のイメージ（実際の映像ではない） */
function RoomMock({ lang }: { lang: Lang }) {
  const seats = [
    { n: lang === 'ja' ? 'さくら' : 'Sakura', s: lang === 'ja' ? '英語' : 'English', c: '#7d95ff', on: true },
    { n: lang === 'ja' ? 'ゆうと' : 'Yuto', s: lang === 'ja' ? '数学' : 'Math', c: '#5fd4b0', on: true },
    { n: lang === 'ja' ? 'あなた' : 'You', s: lang === 'ja' ? '集中中' : 'Focusing', c: '#b48cff', on: true, me: true },
    { n: lang === 'ja' ? 'みお' : 'Mio', s: lang === 'ja' ? '簿記' : 'Bookkeeping', c: '#f5b85a', on: false },
  ]
  return (
    <div className={styles.mock} aria-hidden="true">
      <div className={styles.mockBar}>
        <span>🧠 {lang === 'ja' ? '深夜の受験勉強' : 'Late-night exam prep'}</span>
        <span className={styles.mockTimer}>24:12</span>
      </div>
      <div className={styles.mockGrid}>
        {seats.map(s => (
          <div key={s.n} className={`${styles.mockSeat} ${s.me ? styles.mockMe : ''}`}>
            <div className={styles.mockAvatar} style={{ background: s.on ? `radial-gradient(circle at 50% 35%, ${s.c}cc, ${s.c}33 70%)` : undefined }}>
              {s.on ? <span className={styles.mockLamp}/> : <Icon name="cameraOff" size={16}/>}
            </div>
            <div className={styles.mockName}>{s.n}<span>{s.s}</span></div>
          </div>
        ))}
      </div>
    </div>
  )
}
