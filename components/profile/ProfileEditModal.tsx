'use client'
// 自分のプロフィール編集（画像・表示名・自己紹介）
import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/room/Icons'
import { hasNgWord } from '@/lib/wordFilter'
import { signOut } from 'next-auth/react'
import { DELETE_CONFIRM_WORD } from '@/lib/account'
import styles from './Profile.module.css'

export type EditableProfile = { display_name: string; avatar_url: string | null; bio?: string | null; gender?: string | null; instagram?: string | null }

const MAX_NAME = 20
const MAX_BIO = 160
const AVATAR_PX = 320

/** 画像を中央で正方形に切り抜いて縮小する（容量を小さくし、向きも正しくする） */
async function toSquareImage(file: File): Promise<Blob> {
  let src: CanvasImageSource & { width: number; height: number }
  try {
    src = await createImageBitmap(file)
  } catch {
    src = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(img); img.onerror = reject
      img.src = URL.createObjectURL(file)
    })
  }
  const side = Math.min(src.width, src.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = AVATAR_PX
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, (src.width - side) / 2, (src.height - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX)
  const encode = (type: string, q: number) => new Promise<Blob | null>(r => canvas.toBlob(r, type, q))
  const webp = await encode('image/webp', .86)
  if (webp && webp.type === 'image/webp') return webp
  const jpeg = await encode('image/jpeg', .88)   // 古い Safari は WebP に書き出せない
  if (!jpeg) throw new Error('encode failed')
  return jpeg
}

export default function ProfileEditModal({ profile, lang = 'ja', onClose, onSaved }: {
  profile: EditableProfile
  lang?: 'ja' | 'en'
  onClose: () => void
  onSaved: (p: EditableProfile) => void
}) {
  const ja = lang === 'ja'
  const [name, setName] = useState(profile.display_name)
  const [bio, setBio] = useState(profile.bio ?? '')
  const [gender, setGender] = useState(profile.gender ?? '')
  const [instagram, setInstagram] = useState(profile.instagram ?? '')
  const [image, setImage] = useState<Blob | null>(null)
  const [preview, setPreview] = useState<string | null>(profile.avatar_url)
  const [removed, setRemoved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  // 退会（アプリストアの必須要件）。確認の言葉を入れたときだけ消せる
  const [deleting, setDeleting] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const deleteAccount = async () => {
    setDeleteBusy(true); setError('')
    try {
      const res = await fetch('/api/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: confirmText.trim() }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || (ja ? '退会できませんでした' : 'Could not delete account'))
      await signOut({ callbackUrl: '/?deleted=1' })
    } catch (e) {
      setError((e as Error).message)
      setDeleteBusy(false)
    }
  }

  // Esc で閉じる（親の再描画で onClose が変わっても登録し直さない）
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // プレビュー用 URL の後片付け
  useEffect(() => () => { if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview) }, [preview])

  async function pick(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) { setError(ja ? '画像ファイルを選んでください' : 'Please choose an image'); return }
    try {
      const blob = await toSquareImage(file)
      setImage(blob); setRemoved(false); setError('')
      setPreview(URL.createObjectURL(blob))
    } catch {
      setError(ja ? 'この画像は読み込めませんでした。別の画像を選んでください' : 'Could not read this image')
    }
  }

  async function save() {
    const n = name.trim(), b = bio.trim()
    if (!n) return setError(ja ? '表示名を入力してください' : 'Please enter a name')
    if (hasNgWord(n) || hasNgWord(b)) return setError(ja ? '不適切な言葉が含まれています' : 'Contains inappropriate words')
    setSaving(true); setError('')
    const form = new FormData()
    form.set('display_name', n); form.set('bio', b)
    // 性別・Instagram は変えたときだけ送る（読み込めていない画面から保存しても消えないように）
    if (gender !== (profile.gender ?? '')) form.set('gender', gender)
    if (instagram.trim() !== (profile.instagram ?? '')) form.set('instagram', instagram.trim())
    if (image) form.set('avatar', image, image.type === 'image/webp' ? 'avatar.webp' : 'avatar.jpg')
    else if (removed) form.set('remove_avatar', '1')
    try {
      const res = await fetch('/api/profile', { method: 'POST', body: form })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || (ja ? '保存に失敗しました' : 'Failed to save'))
      onSaved({ ...json.profile, gender: gender || null, instagram: instagram.trim().replace(/^@/, '') || null })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={e => e.stopPropagation()} role="dialog" aria-label={ja ? 'プロフィール編集' : 'Edit profile'}>
        <div className={styles.title}>{ja ? 'プロフィール' : 'Profile'}</div>

        <div className={styles.avatarRow}>
          <div className={`${styles.avatar} ${styles.avatarEdit}`} onClick={() => fileRef.current?.click()}>
            {preview ? <img src={preview} alt=""/> : (name.trim()[0] ?? '?')}
          </div>
          <div className={styles.avatarBtns}>
            <button type="button" className={styles.linkBtn} onClick={() => fileRef.current?.click()}>
              <Icon name="camera" size={14}/>{ja ? '写真を選ぶ' : 'Choose photo'}
            </button>
            {preview && (
              <button type="button" className={styles.textBtn} onClick={() => { setPreview(null); setImage(null); setRemoved(true) }}>
                {ja ? '写真を外す' : 'Remove photo'}
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }}/>
        </div>

        <div className={styles.field}>
          <div className={styles.label}>
            <span>{ja ? '表示名' : 'Name'}</span>
            <span className={`${styles.count} ${name.length > MAX_NAME ? styles.countOver : ''}`}>{name.length}/{MAX_NAME}</span>
          </div>
          <input className={styles.input} value={name} maxLength={MAX_NAME} onChange={e => setName(e.target.value)}
            placeholder={ja ? '表示名' : 'Display name'}/>
        </div>

        <div className={styles.field}>
          <div className={styles.label}>
            <span>{ja ? '自己紹介' : 'About'}</span>
            <span className={`${styles.count} ${bio.length > MAX_BIO ? styles.countOver : ''}`}>{bio.length}/{MAX_BIO}</span>
          </div>
          <textarea className={styles.textarea} value={bio} maxLength={MAX_BIO} onChange={e => setBio(e.target.value)}
            placeholder={ja ? '例）社会人。夜に資格の勉強をしています。目標は来年の春に合格。' : 'e.g. Studying for my exam at night.'}/>
        </div>

        <div className={styles.field}>
          <div className={styles.label}><span>{ja ? '性別（任意）' : 'Gender (optional)'}</span></div>
          <select className={styles.input} value={gender} onChange={e => setGender(e.target.value)}>
            <option value="">{ja ? '設定しない' : 'Prefer not to say'}</option>
            <option value="female">{ja ? '女性' : 'Female'}</option>
            <option value="male">{ja ? '男性' : 'Male'}</option>
            <option value="other">{ja ? 'その他' : 'Other'}</option>
          </select>
          <div className={styles.note}>{ja ? '同じ部屋にいる人・フレンド・ピンでつながった人がプロフィールを開いたときに表示されます' : 'Shown to people in your room, friends and pin connections'}</div>
        </div>

        <div className={styles.field}>
          <div className={styles.label}><span>Instagram{ja ? '（任意）' : ' (optional)'}</span></div>
          <input className={styles.input} value={instagram} maxLength={60} inputMode="url" autoCapitalize="none" autoCorrect="off"
            onChange={e => setInstagram(e.target.value)} placeholder={ja ? 'ユーザー名（例 study_taro）' : 'username'}/>
          <div className={styles.note}>{ja ? 'フレンドと勉強仲間（お互いにピン）にだけ表示されます' : 'Visible only to friends and study buddies'}</div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {!deleting ? (
          <button type="button" className={styles.textBtn} style={{ alignSelf: 'flex-start', opacity: .7 }} onClick={() => setDeleting(true)}>
            {ja ? '退会する（アカウントを削除）' : 'Delete account'}
          </button>
        ) : (
          <div className={styles.field} role="group" aria-label={ja ? '退会の確認' : 'Confirm account deletion'}>
            <div className={styles.note} style={{ color: 'var(--text)' }}>
              {ja
                ? 'プロフィール・勉強記録・フレンド・ピン・メッセージがすべて消え、元に戻せません。プレミアムはすぐに解約されます（残りの期間の返金はありません）。'
                : 'Your profile, study records, friends, pins and messages will be permanently deleted. Premium is canceled immediately without refund.'}
            </div>
            <input className={styles.input} value={confirmText} onChange={e => setConfirmText(e.target.value)}
              placeholder={ja ? `確認のため「${DELETE_CONFIRM_WORD}」と入力` : `Type ${DELETE_CONFIRM_WORD} to confirm`} aria-label={ja ? '確認の言葉' : 'Confirmation'}/>
            <div className={styles.btns}>
              <button type="button" className={styles.ghost} onClick={() => { setDeleting(false); setConfirmText('') }} disabled={deleteBusy}>{ja ? 'やめる' : 'Cancel'}</button>
              <button type="button" className={styles.primary} style={{ background: '#e5484d' }} onClick={deleteAccount}
                disabled={deleteBusy || confirmText.trim() !== DELETE_CONFIRM_WORD}>
                {deleteBusy ? (ja ? '処理中…' : 'Deleting…') : (ja ? '退会する' : 'Delete')}
              </button>
            </div>
          </div>
        )}

        <div className={styles.btns}>
          <button type="button" className={styles.ghost} onClick={onClose}>{ja ? 'キャンセル' : 'Cancel'}</button>
          <button type="button" className={styles.primary} onClick={save} disabled={saving || !name.trim()}>
            {saving ? (ja ? '保存中…' : 'Saving…') : (ja ? '保存' : 'Save')}
          </button>
        </div>
      </div>
    </div>
  )
}
