'use client'
import { signIn } from 'next-auth/react'
import { useState, useEffect } from 'react'
import styles from './LoginClient.module.css'

export default function LoginClient({ error }: { error?: string }) {
  const [loading, setLoading] = useState<'google' | 'line' | null>(null)
  const [lang, setLang] = useState<'ja' | 'en'>('ja')

  useEffect(() => {
    const saved = localStorage.getItem('lang') as 'ja' | 'en'
    if (saved === 'ja' || saved === 'en') setLang(saved)
  }, [])

  const toggleLang = () => {
    const next = lang === 'ja' ? 'en' : 'ja'
    setLang(next)
    localStorage.setItem('lang', next)
  }

  async function loginWith(provider: 'google' | 'line') {
    setLoading(provider)
    // Find first available room
    await signIn(provider, { callbackUrl: '/room/00000000-0000-0000-0000-000000000001' })
  }

  const t = {
    title: lang === 'ja' ? '自習室 JP' : 'Study With Me JP',
    tagline: lang === 'ja' ? 'みんなと一緒に集中して勉強しよう' : 'Study together, stay focused',
    features: lang === 'ja'
      ? ['⏱ ポモドーロタイマー', '🎥 カメラで一緒に勉強', '💬 フレンドとチャット', '✅ タスク共有機能']
      : ['⏱ Pomodoro Timer', '🎥 Study on camera together', '💬 Chat with friends', '✅ Shared task list'],
    loginWith: lang === 'ja' ? 'ログインして始める' : 'Sign in to start',
    google: lang === 'ja' ? 'Googleでログイン' : 'Continue with Google',
    line: lang === 'ja' ? 'LINEでログイン' : 'Continue with LINE',
    loading: lang === 'ja' ? '接続中...' : 'Connecting...',
    error: lang === 'ja' ? 'ログインに失敗しました。もう一度お試しください。' : 'Login failed. Please try again.',
    notice: lang === 'ja'
      ? 'ログインすることで利用規約とプライバシーポリシーに同意したことになります。荒らし行為はアカウントBANの対象となります。'
      : 'By signing in, you agree to our Terms of Service and Privacy Policy.',
  }

  return (
    <div className={styles.wrap}>
      {/* Language toggle */}
      <button onClick={toggleLang} style={{
        position: 'fixed', top: 16, right: 16, padding: '6px 14px',
        background: 'rgba(108,138,255,.15)', border: '1px solid rgba(108,138,255,.3)',
        borderRadius: 20, color: '#a5b4fc', fontSize: 12, cursor: 'pointer',
        fontFamily: 'inherit', fontWeight: 600, zIndex: 10
      }}>
        {lang === 'ja' ? '🇬🇧 English' : '🇯🇵 日本語'}
      </button>

      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>📚</div>
          <h1 className={styles.logoText}>{t.title}</h1>
        </div>
        <p className={styles.tagline}>{t.tagline}</p>
        <div className={styles.features}>
          {t.features.map((f, i) => (
            <div key={i} className={styles.feature}>
              <span>{f.split(' ')[0]}</span> {f.split(' ').slice(1).join(' ')}
            </div>
          ))}
        </div>
        {error && (
          <div style={{ background:'rgba(248,113,113,.1)', border:'1px solid var(--red)', borderRadius:8, padding:'10px 14px', fontSize:12, color:'var(--red)', marginBottom:16 }}>
            ⚠️ {t.error}
          </div>
        )}
        <div className={styles.divider}><span>{t.loginWith}</span></div>
        <div className={styles.buttons}>
          <button className={styles.googleBtn} onClick={() => loginWith('google')} disabled={!!loading}>
            {loading === 'google' ? t.loading : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24">
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
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                </svg>
                {t.line}
              </>
            )}
          </button>
        </div>
        <p className={styles.notice}>{t.notice}</p>
      </div>
    </div>
  )
}
