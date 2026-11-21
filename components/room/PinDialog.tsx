'use client'
// components/room/PinDialog.tsx — ピンするときの小さな画面（理由は任意・ひみつにもできる）
// ひみつのピンは、相手もあなたをピンしたときだけ「実は…」と二人に明かされる
import { useEffect, useRef, useState } from 'react'
import styles from './PinDialog.module.css'

const REASONS = ['同じ目標', '集中してて刺激になる', '同じ時間帯に勉強してる', '一緒にがんばりたい', '科目が同じ']
let idSeq = 0

export default function PinDialog({ name, lang = 'ja', initial, mutual = false, onSubmit, onClose, onUpgrade, onRemove }: {
  name: string
  lang?: 'ja' | 'en'
  /** すでにピンしている場合の内容（編集） */
  initial?: { reason?: string | null; secret?: boolean } | null
  onSubmit: (v: { reason: string; secret: boolean }) => Promise<{ error?: string; upgrade?: boolean } | void>
  onClose: () => void
  onUpgrade?: () => void
  /** お互いにピンしている（勉強仲間） */
  mutual?: boolean
  /** ピンを外す（すでにピンしているときだけ表示） */
  onRemove?: () => Promise<void> | void
}) {
  const ja = lang === 'ja'
  const [reason, setReason] = useState(initial?.reason ?? '')
  const [secret, setSecret] = useState(!!initial?.secret)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ text: string; upgrade?: boolean } | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [titleId] = useState(() => `pin-dialog-title-${++idSeq}`)
  // マウスのある端末だけ最初に入力欄へ（スマホで開いた瞬間にキーボードが説明を隠さないように）
  const [canHover] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover)').matches)
  // 閉じたら、開く前にフォーカスしていたボタンへ戻す
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    return () => { try { prev?.focus() } catch {} }
  }, [])
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
      <div className={styles.card} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={e => e.stopPropagation()}>
        <div className={styles.title} id={titleId}>
          {mutual ? `🤝 ${ja ? `${name}さんとは勉強仲間です` : `You and ${name} are study buddies`}` : `📌 ${ja ? `${name}さんをピン` : `Pin ${name}`}`}
        </div>
        <p className={styles.sub}>{mutual
          ? (ja ? 'お互いにピンしています。理由の変更や、ピンを外すことができます。' : 'You pinned each other.')
          : (ja ? '一緒にがんばりたい人をピンしておけます。お互いにピンすると勉強仲間になり、フレンドとしてメッセージできます。' : 'Pin people you want to study with. Pin each other to become study buddies.')}</p>

        <label className={styles.label}>{ja ? 'ピンした理由（任意・50文字まで）' : 'Why? (optional)'}</label>
        <input className={styles.input} value={reason} maxLength={50} autoFocus={canHover} placeholder={ja ? '例：同じ共通テスト組！' : 'e.g. Same exam!'} onChange={e => setReason(e.target.value)}/>
        <div className={styles.chips}>
          {REASONS.map(r => <button type="button" key={r} className={styles.chip} onClick={() => setReason(r)}>{r}</button>)}
        </div>

        <div className={styles.choice} role="radiogroup" aria-label={ja ? 'ピンの種類' : 'Pin type'}>
          {([
            [false, '👀', ja ? '相手に知らせる' : 'Visible', ja ? '相手に「ピンされました」と理由が届きます' : 'They will see your pin and reason'],
            [true, '🤫', ja ? 'ひみつ' : 'Secret', ja ? '相手には知られません。相手もあなたをピンしたときだけ二人に明かされます' : 'Revealed only if they pin you too'],
          ] as const).map(([val, icon, label, desc]) => (
            <button key={String(val)} type="button" role="radio" aria-checked={secret === val}
              className={`${styles.secret} ${secret === val ? styles.secretOn : ''}`} onClick={() => setSecret(val)}>
              <span className={styles.secretIcon} aria-hidden>{icon}</span>
              <span><b>{label}</b><small>{desc}</small></span>
            </button>
          ))}
        </div>

        {error && (
          <div className={styles.error}>
            {error.text}
            {error.upgrade && onUpgrade && <button type="button" className={styles.upgrade} onClick={onUpgrade}>✦ {ja ? 'プレミアムを見る' : 'See Premium'}</button>}
          </div>
        )}
        <p className={styles.note}>{ja ? '理由に連絡先・SNS・URL は書けません。ブロックするとピンは消えます。' : 'No contact info or URLs. Blocking removes pins.'}</p>
        <div className={styles.btns}>
          {initial && onRemove && (confirmRemove
            ? <button type="button" className={styles.remove} disabled={busy} onClick={async () => { setBusy(true); await onRemove(); setBusy(false) }}>{ja ? '本当に外す' : 'Really unpin'}</button>
            : <button type="button" className={styles.removeText} onClick={() => setConfirmRemove(true)}>{ja ? 'ピンを外す' : 'Unpin'}</button>)}
          <button type="button" className={styles.ghost} onClick={onClose}>{ja ? 'キャンセル' : 'Cancel'}</button>
          <button type="button" className={styles.primary} disabled={busy} onClick={submit}>{busy ? '…' : initial ? (ja ? '更新する' : 'Update') : (ja ? 'ピンする' : 'Pin')}</button>
        </div>
      </div>
    </div>
  )
}
