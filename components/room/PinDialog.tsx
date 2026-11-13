'use client'
// components/room/PinDialog.tsx — ピンするときの小さな画面（理由は任意・ひみつにもできる）
// ひみつのピンは、相手もあなたをピンしたときだけ「実は…」と二人に明かされる
import { useEffect, useRef, useState } from 'react'
import styles from './PinDialog.module.css'

const REASONS = ['同じ目標', '集中してて刺激になる', '同じ時間帯に勉強してる', '一緒にがんばりたい', '科目が同じ']

export default function PinDialog({ name, lang = 'ja', initial, onSubmit, onClose, onUpgrade }: {
  name: string
  lang?: 'ja' | 'en'
  /** すでにピンしている場合の内容（編集） */
  initial?: { reason?: string | null; secret?: boolean } | null
  onSubmit: (v: { reason: string; secret: boolean }) => Promise<{ error?: string; upgrade?: boolean } | void>
  onClose: () => void
  onUpgrade?: () => void
}) {
  const ja = lang === 'ja'
  const [reason, setReason] = useState(initial?.reason ?? '')
  const [secret, setSecret] = useState(!!initial?.secret)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ text: string; upgrade?: boolean } | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function submit() {
    setBusy(true); setError(null)
    const r = await onSubmit({ reason: reason.trim(), secret })
    setBusy(false)
    if (r && r.error) setError({ text: r.error, upgrade: r.upgrade })
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} role="dialog" aria-modal="true" aria-label={ja ? 'ピン' : 'Pin'} onClick={e => e.stopPropagation()}>
        <div className={styles.title}>📌 {ja ? `${name}さんをピン` : `Pin ${name}`}</div>
        <p className={styles.sub}>{ja ? '気になる勉強仲間をピンしておけます。お互いにピンするとマッチして、フレンドになります。' : 'Pin study buddies. If you both pin each other, you match and become friends.'}</p>

        <label className={styles.label}>{ja ? 'ピンした理由（任意・50文字まで）' : 'Why? (optional)'}</label>
        <input className={styles.input} value={reason} maxLength={50} placeholder={ja ? '例：同じ共通テスト組！' : 'e.g. Same exam!'} onChange={e => setReason(e.target.value)}/>
        <div className={styles.chips}>
          {REASONS.map(r => <button type="button" key={r} className={styles.chip} onClick={() => setReason(r)}>{r}</button>)}
        </div>

        <button type="button" className={`${styles.secret} ${secret ? styles.secretOn : ''}`} aria-pressed={secret} onClick={() => setSecret(v => !v)}>
          <span className={styles.secretIcon}>{secret ? '🤫' : '👀'}</span>
          <span>
            <b>{secret ? (ja ? 'ひみつのピン' : 'Secret pin') : (ja ? '相手に知らせるピン' : 'Visible pin')}</b>
            <small>{secret
              ? (ja ? '相手には知られません。相手もあなたをピンしたときだけ「実は…」と二人に明かされます' : 'Revealed only if they pin you too')
              : (ja ? '相手に「ピンされました」と理由が届きます' : 'They will see your pin and reason')}</small>
          </span>
        </button>

        {error && (
          <div className={styles.error}>
            {error.text}
            {error.upgrade && onUpgrade && <button type="button" className={styles.upgrade} onClick={onUpgrade}>✦ {ja ? 'プレミアムを見る' : 'See Premium'}</button>}
          </div>
        )}
        <p className={styles.note}>{ja ? '理由に連絡先や URL は書けません。ブロックするとピンは消えます。' : 'No contact info or URLs. Blocking removes pins.'}</p>
        <div className={styles.btns}>
          <button type="button" className={styles.ghost} onClick={onClose}>{ja ? 'キャンセル' : 'Cancel'}</button>
          <button type="button" className={styles.primary} disabled={busy} onClick={submit}>{busy ? '…' : initial ? (ja ? '更新する' : 'Update') : (ja ? 'ピンする' : 'Pin')}</button>
        </div>
      </div>
    </div>
  )
}
