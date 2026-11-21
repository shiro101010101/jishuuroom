'use client'
// 他の人のプロフィールカード（名前やアバターを押すと開く）
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { examLabel } from '@/lib/exams'
import styles from './Profile.module.css'

type ProfileView = {
  display_name: string
  avatar_url: string | null
  bio: string | null
  study_streak: number | null
  total_study_seconds: number | null
  created_at: string | null
}

const hours = (s: number) => {
  const h = s / 3600
  return h >= 10 ? Math.round(h).toString() : h.toFixed(1)
}

export default function ProfileCard({ userId, lang = 'ja', onClose, children }: {
  userId: string
  lang?: 'ja' | 'en'
  onClose: () => void
  /** フレンド申請・チャットなどのボタン */
  children?: React.ReactNode
}) {
  const ja = lang === 'ja'
  const [p, setP] = useState<ProfileView | null>(null)
  const [failed, setFailed] = useState(false)
  const [extra, setExtra] = useState<{ gender: string | null; goal: string | null; premium: boolean; instagram: string | null; hasInstagram: boolean } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/profile/view?id=${encodeURIComponent(userId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null).then(d => { if (!cancelled && d) setExtra(d) }).catch(() => {})
    return () => { cancelled = true }
  }, [userId])

  useEffect(() => {
    let cancelled = false
    createClient().from('profiles')
      .select('display_name, avatar_url, bio, study_streak, total_study_seconds, created_at')
      .eq('id', userId).maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) setFailed(true); else setP(data as ProfileView)
      })
    return () => { cancelled = true }
  }, [userId])

  // Esc で閉じる（親の再描画で onClose が変わっても登録し直さない）
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const since = p?.created_at ? new Date(p.created_at) : null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={e => e.stopPropagation()} role="dialog" aria-label={ja ? 'プロフィール' : 'Profile'}>
        {!p ? (
          <div className={styles.loading}>{failed ? (ja ? 'プロフィールを読み込めませんでした' : 'Could not load profile') : (ja ? '読み込み中…' : 'Loading…')}</div>
        ) : (
          <>
            <div className={styles.viewHead}>
              <div className={styles.avatar}>{p.avatar_url ? <img src={p.avatar_url} alt=""/> : p.display_name[0]}</div>
              <div>
                <div className={styles.viewName}>{p.display_name}</div>
                {since && <div className={styles.viewSub}>{ja ? `${since.getFullYear()}年${since.getMonth() + 1}月から利用` : `Joined ${since.toLocaleDateString('en', { year: 'numeric', month: 'short' })}`}</div>}
              </div>
            </div>
            {extra && (extra.premium || extra.gender || extra.goal || extra.instagram) && (
              <div className={styles.extraRow}>
                {extra.premium && <span className={`${styles.extraChip} ${styles.premiumChip}`}>✦ Premium</span>}
                {extra.goal && examLabel(extra.goal) && <span className={styles.extraChip}>🎯 {examLabel(extra.goal)}</span>}
                {extra.gender && <span className={styles.extraChip}>{extra.gender === 'female' ? (ja ? '女性' : 'Female') : extra.gender === 'male' ? (ja ? '男性' : 'Male') : (ja ? 'その他' : 'Other')}</span>}
                {extra.instagram && (
                  <a className={styles.extraChip} href={`https://www.instagram.com/${encodeURIComponent(extra.instagram)}/`} target="_blank" rel="noopener noreferrer nofollow">📷 @{extra.instagram}</a>
                )}
              </div>
            )}
            <div className={styles.bio}>
              {p.bio || <span className={styles.bioEmpty}>{ja ? 'まだ自己紹介はありません' : 'No bio yet'}</span>}
            </div>
            <div className={styles.stats}>
              <div className={styles.stat}>
                <div className={styles.statVal}>{p.study_streak ?? 0}<span>{ja ? '日' : 'd'}</span></div>
                <div className={styles.statLbl}>{ja ? '連続日数' : 'Streak'}</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statVal}>{hours(p.total_study_seconds ?? 0)}<span>{ja ? '時間' : 'h'}</span></div>
                <div className={styles.statLbl}>{ja ? 'これまでの勉強時間' : 'Total study time'}</div>
              </div>
            </div>
            {children && <div className={styles.actions}>{children}</div>}
          </>
        )}
      </div>
    </div>
  )
}
