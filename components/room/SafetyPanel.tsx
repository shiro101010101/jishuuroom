'use client'
// components/room/SafetyPanel.tsx
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
  lang?: 'ja' | 'en'
  onFaceDetectChange: (v: boolean) => void
  onNoFaceThresholdChange: (v: number) => void
  onAwayEnabledChange: (v: boolean) => void
  onAwayMinutesChange: (v: number) => void
}

export default function SafetyPanel({
  userId, cameraOn,
  faceDetectEnabled, noFaceThreshold,
  awayEnabled, awayMinutes,
  faceStatus, noFaceSeconds,
  lang = 'ja',
  onFaceDetectChange, onNoFaceThresholdChange,
  onAwayEnabledChange, onAwayMinutesChange,
}: Props) {
  const supabase = createClient()
  const [parentEmail, setParentEmail] = useState('')
  const [notifyMethod, setNotifyMethod] = useState<'email' | 'none'>('none')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pin, setPin] = useState('')
  const [savedPin, setSavedPin] = useState('')
  const [pinInput, setPinInput] = useState('')
  const [pinVerified, setPinVerified] = useState(false)
  const [pinError, setPinError] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data } = await (supabase as any)
        .from('profiles')
        .select('parent_email, notify_method')
        .eq('id', userId)
        .single()
      if (data) {
        setParentEmail(data.parent_email || '')
        setNotifyMethod(data.notify_method || 'none')
        setSavedPin(data.parent_pin || '')
        if (data.parent_pin) setPinVerified(false)
        else setPinVerified(true)
      }
    }
    load()
  }, [userId])

  async function save() {
    setSaving(true)
    await (supabase as any).from('profiles').update({
      parent_email: parentEmail || null,
      notify_method: notifyMethod,
      parent_pin: pin || savedPin || null,
    }).eq('id', userId)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const pct = noFaceThreshold > 0
    ? Math.min(100, Math.round((noFaceSeconds / noFaceThreshold) * 100))
    : 0

  const ja = lang === 'ja'

  return (
    <div className={styles.wrap}>

      {/* ── 検出システム説明 ── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>{ja ? '🔍 集中管理システム' : '🔍 Focus Management'}</div>

        <div className={styles.card} style={{ borderColor:'rgba(248,113,113,.3)' }}>
          <div className={styles.cardHead}>
            <span style={{ fontSize:18 }}>📱</span>
            <div>
              <div className={styles.cardTitle}>{ja ? '別タブ移動検出' : 'Tab Switch Detection'}</div>
              <div className={styles.cardDesc}>
                ブラウザの「タブ切り替え」や「別ウィンドウへの移動」を検知します。
                同じタブ内での操作（本を読む・ノートを書くなど）は検出されません
              </div>
            </div>
            <span className={styles.badge} style={{ background:'rgba(52,211,153,.12)', color:'#34d399' }}>{ja ? '常時ON' : 'Always ON'}</span>
          </div>
        </div>

        <div className={styles.card} style={{ borderColor: faceDetectEnabled && cameraOn ? 'rgba(108,138,255,.3)' : 'var(--border)' }}>
          <div className={styles.cardHead}>
            <span style={{ fontSize:18 }}>😊</span>
            <div>
              <div className={styles.cardTitle}>{ja ? '顔検出' : 'Face Detection'}</div>
              <div className={styles.cardDesc}>
                カメラ映像から肌色ピクセルを検出して顔の有無を判定します。
                顔が映っていない時間が設定時間を超えると警告。
                トイレ・お茶・ストレッチなどは時間内なら問題なし。
                データは外部に送信されません🔒
              </div>
            </div>
            <span className={styles.badge} style={{
              background: faceDetectEnabled && cameraOn ? 'rgba(108,138,255,.12)' : 'var(--bg)',
              color: faceDetectEnabled && cameraOn ? '#6c8aff' : 'var(--muted)'
            }}>
              {cameraOn ? (faceDetectEnabled ? 'ON' : 'OFF') : 'カメラOFF'}
            </span>
          </div>

          {/* 顔検出設定 */}
          <div className={styles.cardBody}>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={faceDetectEnabled}
                onChange={e => onFaceDetectChange(e.target.checked)}
                disabled={!cameraOn}
                style={{ accentColor:'var(--accent)', width:14, height:14 }} />
              <span style={{ fontSize:12, color: cameraOn ? 'var(--muted2)' : 'var(--muted)' }}>
                {ja ? '顔検出を有効にする' : 'Enable face detection'}
                {!cameraOn && <span style={{ fontSize:10, marginLeft:4 }}>{ja ? '（カメラをONにしてください）' : '(Please enable camera)'}</span>}
              </span>
            </label>

            {faceDetectEnabled && cameraOn && (
              <>
                <div className={styles.row}>
                  <span className={styles.label}>{ja ? '警告までの時間' : 'Alert threshold'}</span>
                  <select value={noFaceThreshold} onChange={e => onNoFaceThresholdChange(Number(e.target.value))}
                    className={styles.select}>
                    <option value={30}>{ja ? "30秒（厳しめ）" : "30s (strict)"}</option>
                    <option value={60}>1分</option>
                    <option value={120}>{ja ? "2分（トイレ・お茶）" : "2min (toilet/drink)"}</option>
                    <option value={180}>3分</option>
                    <option value={300}>{ja ? "5分（ストレッチ）" : "5min (stretch)"}</option>
                    <option value={600}>{ja ? "10分（ゆるめ）" : "10min (relaxed)"}</option>
                  </select>
                </div>
                <div className={styles.statusRow}>
                  <div className={styles.dot} style={{
                    background: faceStatus === 'face_detected' ? '#34d399'
                      : faceStatus === 'no_face' ? '#f87171' : '#64748b'
                  }} />
                  <span style={{ fontSize:11, color:'var(--muted2)' }}>
                    {faceStatus === 'face_detected' ? ja ? '😊 顔を検出中' : '😊 Face detected'
                      : faceStatus === 'no_face' ? ja ? `😴 顔なし ${noFaceSeconds}秒 / ${noFaceThreshold}秒` : `😴 No face ${noFaceSeconds}s / ${noFaceThreshold}s`
                      : faceStatus === 'checking' ? ja ? '🔍 確認中...' : '🔍 Checking...' : ja ? '待機中' : 'Standby'}
                  </span>
                  {faceStatus === 'no_face' && (
                    <div className={styles.prog}>
                      <div className={styles.progFill} style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span style={{ fontSize:18 }}>🚫</span>
            <div>
              <div className={styles.cardTitle}>{ja ? '不適切ワードフィルター' : 'Word Filter'}</div>
              <div className={styles.cardDesc}>
                暴言・性的表現・外見差別などの言葉を自動検知。
                送信前にブロックされるため相手には届きません
              </div>
            </div>
            <span className={styles.badge} style={{ background:'rgba(52,211,153,.12)', color:'#34d399' }}>{ja ? '常時ON' : 'Always ON'}</span>
          </div>
        </div>

        {/* 操作なし検出（折りたたみ） */}
        <div className={styles.card} style={{ opacity: awayEnabled ? 1 : 0.6 }}>
          <div className={styles.cardHead}>
            <span style={{ fontSize:18 }}>⌨️</span>
            <div>
              <div className={styles.cardTitle}>
                操作なし検出
                <span style={{ fontSize:10, color:'var(--muted)', fontWeight:400, marginLeft:6 }}>
                  {ja ? '本や考え事をする場合は非推奨' : 'Not recommended for reading/thinking'}
                </span>
              </div>
              <div className={styles.cardDesc}>{ja ? 'マウス・キーボード操作がない時間が続くと警告します' : 'Alerts when no mouse/keyboard activity detected'}</div>
            </div>
          </div>
          <div className={styles.cardBody}>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={awayEnabled}
                onChange={e => onAwayEnabledChange(e.target.checked)}
                style={{ accentColor:'var(--accent)', width:14, height:14 }} />
              <span style={{ fontSize:12, color:'var(--muted2)' }}>{ja ? '有効にする（デフォルトOFF）' : 'Enable (default OFF)'}</span>
            </label>
            {awayEnabled && (
              <div className={styles.row}>
                <span className={styles.label}>{ja ? '検出時間' : 'Threshold'}</span>
                <select value={awayMinutes} onChange={e => onAwayMinutesChange(Number(e.target.value))}
                  className={styles.select}>
                  {[1,3,5,10,15].map(m => <option key={m} value={m}>{m}分</option>)}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 保護者通知 ── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>{ja ? '📨 離席検出の通知先' : '📨 Absence Alert Recipient'} <span style={{ fontSize:10, fontWeight:400, color:'var(--muted)' }}>{ja ? '（オプション・PIN保護）' : '(Optional · PIN protected)'}</span></div>

        {/* PIN verification */}
        {savedPin && !pinVerified && (
          <div className={styles.pinBox}>
            <div style={{ fontSize:12, color:'var(--muted2)', marginBottom:8 }}>{ja ? '🔐 通知先を変更するにはPINを入力してください' : '🔐 Enter PIN to change notification settings'}</div>
            <div style={{ display:'flex', gap:6 }}>
              <input type="password" maxLength={4} value={pinInput}
                onChange={e => { setPinInput(e.target.value); setPinError(false) }}
                {...(ja?{placeholder:'4桁PIN'}:{placeholder:'4-digit PIN'})}
                style={{ width:80, padding:'6px 10px', background:'var(--bg2)', border:`1px solid ${pinError?'#f87171':'var(--border)'}`, borderRadius:6, color:'var(--text)', fontSize:14, textAlign:'center', letterSpacing:4, fontFamily:'inherit', outline:'none' }} />
              <button onClick={() => {
                if (pinInput === savedPin) { setPinVerified(true); setPinInput('') }
                else { setPinError(true); setPinInput('') }
              }} style={{ padding:'6px 14px', background:'var(--accent)', border:'none', borderRadius:6, color:'#fff', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
                確認
              </button>
            </div>
            {pinError && <div style={{ fontSize:11, color:'#f87171', marginTop:4 }}>{ja ? 'PINが違います' : 'Incorrect PIN'}</div>}
          </div>
        )}

        {!savedPin && (
          <div className={styles.row}>
            <span className={styles.label}>{ja ? '🔐 変更防止PIN' : '🔐 Lock PIN'}</span>
            <input type="password" maxLength={4} value={pin}
              onChange={e => setPin(e.target.value)}
              {...(ja?{placeholder:'4桁（任意）'}:{placeholder:'4 digits (optional)'})}
              style={{ width:100, padding:'5px 10px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text)', fontSize:14, textAlign:'center', letterSpacing:4, fontFamily:'inherit', outline:'none' }} />
          </div>
        )}

        {(pinVerified || !savedPin) && (
          <div>
          <div className={styles.row}>
          <span className={styles.label}>通知方法</span>
          <div style={{ display:'flex', gap:6 }}>
            {(['none','email'] as const).map(m => (
              <button key={m} onClick={() => setNotifyMethod(m)}
                style={{ padding:'5px 12px', borderRadius:6,
                  border:`1px solid ${notifyMethod===m?'var(--accent)':'var(--border)'}`,
                  background: notifyMethod===m?'rgba(108,138,255,.12)':'transparent',
                  color: notifyMethod===m?'var(--accent)':'var(--muted)',
                  fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
                {m==='none' ? (ja ? '通知なし' : 'No notification') : (ja ? '📧 メール通知' : '📧 Email alert')}
              </button>
            ))}
          </div>
        </div>

        {notifyMethod === 'email' && (
          <>
            <div className={styles.row}>
              <span className={styles.label}>{ja ? '通知先メール' : 'Alert email'}</span>
              <input type="email" value={parentEmail}
                onChange={e => setParentEmail(e.target.value)}
                {...(ja?{placeholder:'通知先メールアドレス'}:{placeholder:'Alert email address'})}
                className={styles.input} />
            </div>
            <div className={styles.infoBox}>
              {ja ? '📋 以下のタイミングでメールが届きます：' : '📋 You will receive an email when:'}
              <ul style={{ margin:'6px 0 0 14px', padding:0, fontSize:10, color:'var(--muted)', lineHeight:1.8 }}>
                <li>{ja ? "😊 顔が検出されない時間が続いた時" : "😊 Face not detected for extended period"}</li>
                <li>{ja ? "📱 別タブへの移動が3回以上続いた時" : "📱 Tab switched 3+ times consecutively"}</li>
                <li>{ja ? "🚫 不適切な言葉の送信を試みた時" : "🚫 Inappropriate word detected"}</li>
              </ul>
            </div>
            <button onClick={save} disabled={saving || !parentEmail}
              style={{ marginTop:10, width:'100%', padding:'9px', background:'var(--accent)', border:'none', borderRadius:7,
                color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
                opacity: !parentEmail ? 0.5 : 1 }}>
              {saving ? ja ? '保存中...' : 'Saving...' : saved ? ja ? '✅ 保存しました！' : '✅ Saved!' : ja ? '保存する' : 'Save'}
            </button>
          </>
        )}
        </div>
        )}
      </div>

    </div>
  )
}
