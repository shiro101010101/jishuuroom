'use client'
// components/lobby/GoalOnboarding.tsx — はじめての人向け：「あなたの目標は？」を 1 ステップで選ぶカード
// 選ぶと /api/profile/goal に保存。「あとで」で閉じた場合はこの端末では再表示しない
import { useEffect, useState } from 'react'
import { EXAMS, examLabel, type ExamSlug } from '@/lib/exams'
import styles from './Lobby.module.css'

const DISMISS_KEY = 'jishu:goal-card-dismissed'

export default function GoalOnboarding() {
  // 端末の「閉じた」記録を読むまで出さない（一瞬表示されて消えるのを防ぐ）
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState<ExamSlug | null>(null)
  const [saved, setSaved] = useState<ExamSlug | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let dismissed = false
    try { dismissed = localStorage.getItem(DISMISS_KEY) === '1' } catch {}
    setVisible(!dismissed)
  }, [])

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch {}
    setVisible(false)
  }

  async function choose(slug: ExamSlug) {
    if (busy) return
    setBusy(slug); setError(null)
    try {
      const res = await fetch('/api/profile/goal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: slug }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? '保存できませんでした'); return }
      setSaved(slug)
    } catch {
      setError('通信に失敗しました。もう一度お試しください')
    } finally { setBusy(null) }
  }

  if (!visible) return null

  if (saved) {
    return (
      <section className={`${styles.goalCard} ${styles.goalDone}`} aria-live="polite">
        <div className={styles.goalHead}>
          <div>
            <div className={styles.goalTitle}>🎯 目標は「{examLabel(saved)}」</div>
            <p className={styles.goalSub}>ランキングの「同じ目標」タブで、同じ試験をめざす仲間と勉強時間を比べられます。次は下のボタンから、まず 25 分だけ。</p>
          </div>
          <button className={styles.goalClose} onClick={() => setVisible(false)} aria-label="閉じる">×</button>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.goalCard} aria-labelledby="goal-title">
      <div className={styles.goalHead}>
        <div>
          <div className={styles.goalStep}>はじめに ・ 1 つ選ぶだけ</div>
          <h2 id="goal-title" className={styles.goalTitle}>あなたの目標は？</h2>
          <p className={styles.goalSub}>同じ目標の仲間とランキングで競えるようになります。あとから変えられます。</p>
        </div>
        <button className={styles.goalClose} onClick={dismiss} aria-label="あとで選ぶ">×</button>
      </div>
      <div className={styles.goalChips}>
        {EXAMS.map(e => (
          <button key={e.slug} className={styles.goalChip} disabled={!!busy} onClick={() => choose(e.slug)} aria-busy={busy === e.slug}>
            <span aria-hidden>{e.emoji}</span>{busy === e.slug ? '保存中…' : e.label}
          </button>
        ))}
      </div>
      {error && <div className={styles.createError} role="alert">{error}</div>}
      <button className={styles.goalLater} onClick={dismiss}>あとで選ぶ</button>
    </section>
  )
}
