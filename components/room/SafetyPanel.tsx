'use client'
// components/room/SafetyPanel.tsx — 安全・監視設定パネル
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './SafetyPanel.module.css'

type Props = {
  userId: string
  cameraOn: boolean
  faceDetectEnabled: boolean
  noFaceThreshold: number
  awayEnabled: boolean
  awayMinutes: number
  faceStatus: string
  noFaceSeconds: number
  onFaceDetectChange: (v: boolean) => void
  onNoFaceThresholdChange: (v: number) => void
  onAwayEnabledChange: (v: boolean) => void
  onAwayMinutesChange: (v: number) => void
}

const WORD_FILTERS = [
  // 暴言
  '死ね', 'バカ', 'アホ', 'きもい', 'うざい', '消えろ', 'クソ', 'ばか', 'あほ', 'ゴミ', 'カス',
  // 性的表現
  'えっち', 'エッチ', 'セックス', 'チンコ', 'マンコ', 'おっぱい', 'ちんちん', 'おちんちん',
  'ヌード', '裸', 'えろ', 'エロ', '18禁', 'アダルト',
  // その他不適切
  'キモい', 'デブ', 'ブス', 'キショい',
]

export default function SafetyPanel({
  userId, cameraOn,
  faceDetectEnabled, noFaceThreshold,
  awayEnabled, awayMinutes,
  faceStatus, noFaceSeconds,
  onFaceDetectChange, onNoFaceThresholdChange,
  onAwayEnabledChange, onAwayMinutesChange,
}: Props) {
  const supabase = createClient()
  const [parentEmail, setParentEmail] = useState('')
  const [parentContact, setParentContact] = useState('')
  const [notifyMethod, setNotifyMethod] = useState<'email' | 'line' | 'none'>('none')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data } = await (supabase as any).from('profiles')
        .select('parent_email, parent_contact, notify_method')
        .eq('id', userId).single()
      if (data) {
        setParentEmail(data.parent_email || '')
        setParentContact(data.parent_contact || '')
        setNotifyMethod(data.notify_method || 'none')
      }
    }
    load()
  }, [userId])

  async function saveParentInfo() {
    setSaving(true)
    await (supabase as any).from('profiles').update({
      parent_email: parentEmail || null,
      parent_contact: parentContact || null,
      notify_method: notifyMethod,
    }).eq('id', userId)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className={styles.wrap}>
      {/* 検出システム説明 */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>🔍 集中管理システム</div>
        <div className={styles.featureList}>
          <div className={styles.featureItem}>
            <div className={styles.featureIcon} style={{ background: 'rgba(248,113,113,.15)', color: '#f87171' }}>📱</div>
            <div>
              <div className={styles.featureName}>別タブ移動検出</div>
              <div className={styles.featureDesc}>タイマー中に別のタブやアプリに移動すると即座に警告が出ます</div>
            </div>
            <div className={styles.featureBadge} style={{ background: 'rgba(52,211,153,.12)', color: '#34d399' }}>常時ON</div>
          </div>

          <div className={styles.featureItem}>
            <div className={styles.featureIcon} style={{ background: 'rgba(108,138,255,.15)', color: '#6c8aff' }}>😊</div>
            <div>
              <div className={styles.featureName}>顔検出</div>
              <div className={styles.featureDesc}>カメラに顔が映っていない時間が続くと警告。席を外した時間を検知します</div>
            </div>
            <div className={styles.featureBadge} style={{ background: cameraOn ? 'rgba(108,138,255,.12)' : 'var(--bg3)', color: cameraOn ? '#6c8aff' : 'var(--muted)' }}>
              {cameraOn ? 'カメラON時' : 'カメラOFF'}
            </div>
          </div>

          <div className={styles.featureItem}>
            <div className={styles.featureIcon} style={{ background: 'rgba(251,191,36,.15)', color: '#fbbf24' }}>🚫</div>
            <div>
              <div className={styles.featureName}>不適切ワードフィルター</div>
              <div className={styles.featureDesc}>チャットや今日の一言に不適切な言葉が含まれる場合ブロックします</div>
            </div>
            <div className={styles.featureBadge} style={{ background: 'rgba(52,211,153,.12)', color: '#34d399' }}>常時ON</div>
          </div>
        </div>
      </div>

      {/* 顔検出設定 */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>😊 顔検出の設定</div>
        <div className={styles.settingRow}>
          <label className={styles.settingLabel}>
            <input type="checkbox" checked={faceDetectEnabled}
              onChange={e => onFaceDetectChange(e.target.checked)}
              disabled={!cameraOn}
              style={{ accentColor: 'var(--accent)', width: 14, height: 14 }} />
            顔検出を有効にする
            {!cameraOn && <span className={styles.disabled}>（カメラをONにしてください）</span>}
          </label>
        </div>
        {faceDetectEnabled && cameraOn && (
          <>
            <div className={styles.settingRow}>
              <span className={styles.settingLabel}>警告までの時間</span>
              <select value={noFaceThreshold} onChange={e => onNoFaceThresholdChange(Number(e.target.value))}
                className={styles.select}>
                <option value={30}>30秒（厳しめ）</option>
                <option value={60}>1分</option>
                <option value={120}>2分（トイレ・お茶）</option>
                <option value={180}>3分</option>
                <option value={300}>5分（ストレッチ）</option>
                <option value={600}>10分（ゆるめ）</option>
              </select>
            </div>
            <div className={styles.statusBar}>
              <div className={styles.statusDot} style={{
                background: faceStatus === 'face_detected' ? '#34d399' : faceStatus === 'no_face' ? '#f87171' : '#64748b'
              }} />
              <span style={{ fontSize: 12, color: 'var(--muted2)' }}>
                {faceStatus === 'face_detected' ? '😊 顔を検出中' :
                 faceStatus === 'no_face' ? `😴 顔なし ${noFaceSeconds}秒 / ${noFaceThreshold}秒` :
                 faceStatus === 'checking' ? '🔍 確認中...' : '待機中'}
              </span>
              {faceStatus === 'no_face' && noFaceThreshold > 0 && (
                <div className={styles.progressBar}>
                  <div className={styles.progressFill}
                    style={{ width: `${Math.min(100, (noFaceSeconds / noFaceThreshold) * 100)}%` }} />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 操作なし検出（非推奨） */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>⌨️ 操作なし検出 <span style={{ fontSize:10, color:'var(--muted)', fontWeight:400 }}>（本読みには非推奨）</span></div>
        <div className={styles.settingRow}>
          <label className={styles.settingLabel}>
            <input type="checkbox" checked={awayEnabled}
              onChange={e => onAwayEnabledChange(e.target.checked)}
              style={{ accentColor: 'var(--accent)', width: 14, height: 14 }} />
            マウス・キーボード操作なし検出
          </label>
        </div>
        {awayEnabled && (
          <div className={styles.settingRow}>
            <span className={styles.settingLabel}>検出時間</span>
            <select value={awayMinutes} onChange={e => onAwayMinutesChange(Number(e.target.value))}
              className={styles.select}>
              {[1,3,5,10,15].map(m => <option key={m} value={m}>{m}分</option>)}
            </select>
          </div>
        )}
      </div>

      {/* 保護者連絡先 */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>👨‍👩‍👧 保護者への通知設定 <span style={{ fontSize:10, color:'var(--muted)', fontWeight:400 }}>（オプション）</span></div>
        <div className={styles.settingRow}>
          <span className={styles.settingLabel}>通知方法</span>
          <div style={{ display:'flex', gap:6 }}>
            {(['none','email','line'] as const).map(m => (
              <button key={m} onClick={() => setNotifyMethod(m)}
                style={{ padding:'4px 10px', borderRadius:6, border:`1px solid ${notifyMethod===m?'var(--accent)':'var(--border)'}`,
                  background: notifyMethod===m?'rgba(108,138,255,.12)':'transparent',
                  color: notifyMethod===m?'var(--accent)':'var(--muted)', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
                {m==='none'?'通知なし':m==='email'?'📧 メール':'💬 LINE'}
              </button>
            ))}
          </div>
        </div>
        {notifyMethod === 'email' && (
          <div className={styles.settingRow}>
            <span className={styles.settingLabel}>保護者のメール</span>
            <input type="email" value={parentEmail} onChange={e => setParentEmail(e.target.value)}
              placeholder="parent@example.com" className={styles.input} />
          </div>
        )}
        {notifyMethod === 'line' && (
          <div className={styles.settingCol}>
            <div className={styles.settingRow}>
              <span className={styles.settingLabel}>LINE連絡先</span>
              <input type="text" value={parentContact} onChange={e => setParentContact(e.target.value)}
                placeholder="LINE IDまたは電話番号" className={styles.input} />
            </div>
            <div style={{ fontSize:10, color:'var(--muted)', padding:'4px 0' }}>
              ※ LINE Notifyを使用します。保護者が事前にトークンを取得して共有してください
            </div>
          </div>
        )}
        {notifyMethod !== 'none' && (
          <div style={{ fontSize:11, color:'var(--muted2)', background:'rgba(108,138,255,.06)', borderRadius:6, padding:'8px 10px', marginTop:6 }}>
            📋 通知されるタイミング：
            <div style={{ marginTop:4, display:'flex', flexDirection:'column', gap:2 }}>
              <span>・顔が検出されない時間が続いた時</span>
              <span>・別タブへの移動が3回以上続いた時</span>
              <span>・不適切な言葉が検出された時</span>
            </div>
          </div>
        )}
        {notifyMethod !== 'none' && (
          <button onClick={saveParentInfo} disabled={saving}
            style={{ marginTop:10, padding:'8px 16px', background:'var(--accent)', border:'none', borderRadius:7,
              color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', width:'100%' }}>
            {saving ? '保存中...' : saved ? '✅ 保存しました' : '保存する'}
          </button>
        )}
      </div>

      {/* フィルタリング対象ワード */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>🚫 フィルタリング対象ワード</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
          {WORD_FILTERS.map(w => (
            <span key={w} style={{ padding:'2px 8px', borderRadius:8, background:'rgba(248,113,113,.1)', color:'var(--red)', fontSize:11, border:'1px solid rgba(248,113,113,.2)' }}>
              {w}
            </span>
          ))}
        </div>
        <div style={{ fontSize:10, color:'var(--muted)', marginTop:6 }}>
          これらの言葉を含むチャットや一言はブロックされます
        </div>
      </div>
    </div>
  )
}
