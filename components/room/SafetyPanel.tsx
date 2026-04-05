'use client'
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
  const ja = lang === 'ja'

  // Detection settings
  const [parentEmail, setParentEmail] = useState('')
  const [notifyMethod, setNotifyMethod] = useState<'email' | 'none'>('none')
  const [savedPin, setSavedPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [pinInput, setPinInput] = useState('')
  const [pinVerified, setPinVerified] = useState(false)
  const [pinError, setPinError] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showDetectionSettings, setShowDetectionSettings] = useState(true)
  const [showNotifySettings, setShowNotifySettings] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data } = await (supabase as any)
        .from('profiles')
        .select('parent_email, notify_method, parent_pin')
        .eq('id', userId)
        .single()
      if (data) {
        setParentEmail(data.parent_email || '')
        setNotifyMethod(data.notify_method || 'none')
        setSavedPin(data.parent_pin || '')
        // If no PIN set, auto-verify
        if (!data.parent_pin) setPinVerified(true)
      }
    }
    load()
  }, [userId])

  async function save() {
    setSaving(true)
    await (supabase as any).from('profiles').update({
      parent_email: parentEmail || null,
      notify_method: notifyMethod,
      parent_pin: newPin || savedPin || null,
    }).eq('id', userId)
    if (newPin) setSavedPin(newPin)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const pct = noFaceThreshold > 0 ? Math.min(100, Math.round((noFaceSeconds / noFaceThreshold) * 100)) : 0

  return (
    <div className={styles.wrap}>

      {/* ── 検出システム説明 ── */}
      <div className={styles.section}>
        <button onClick={() => setShowDetectionSettings(v => !v)}
          style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', background:'none', border:'none', cursor:'pointer', padding:0, marginBottom:8 }}>
          <div className={styles.sectionTitle} style={{ margin:0 }}>
            🔍 {ja ? '集中管理システム' : 'Focus Management'}
          </div>
          <span style={{ fontSize:12, color:'var(--muted)' }}>{showDetectionSettings ? '▲' : '▼'}</span>
        </button>

        {showDetectionSettings && (<>
          {/* Tab detection */}
          <div className={styles.card} style={{ borderColor:'rgba(52,211,153,.2)' }}>
            <div className={styles.cardHead}>
              <span style={{ fontSize:16 }}>📱</span>
              <div>
                <div className={styles.cardTitle}>{ja ? '別タブ移動検出' : 'Tab Switch Detection'}</div>
                <div className={styles.cardDesc}>{ja ? 'タイマー中に別タブ・別アプリへ移動すると即警告。同じ画面内での操作（本・ノート）は検出されません' : 'Alerts when switching tabs during timer. In-app actions (reading, notes) are NOT detected'}</div>
              </div>
              <span className={styles.badge} style={{ background:'rgba(52,211,153,.12)', color:'#34d399' }}>{ja ? '常時ON' : 'Always ON'}</span>
            </div>
          </div>

          {/* Face detection */}
          <div className={styles.card} style={{ borderColor: faceDetectEnabled && cameraOn ? 'rgba(108,138,255,.3)' : 'var(--border)', marginTop:6 }}>
            <div className={styles.cardHead}>
              <span style={{ fontSize:16 }}>😊</span>
              <div>
                <div className={styles.cardTitle}>{ja ? '顔検出' : 'Face Detection'}</div>
                <div className={styles.cardDesc}>{ja ? 'カメラから肌色を検出。設定時間顔が映らないと警告。データ外部送信なし🔒' : 'Detects skin-tone from camera. Alerts if face absent. No external data sent🔒'}</div>
              </div>
              <span className={styles.badge} style={{
                background: faceDetectEnabled && cameraOn ? 'rgba(108,138,255,.12)' : 'var(--bg3)',
                color: faceDetectEnabled && cameraOn ? '#6c8aff' : 'var(--muted)'
              }}>
                {cameraOn ? (faceDetectEnabled ? 'ON' : 'OFF') : (ja ? 'カメラOFF' : 'Cam OFF')}
              </span>
            </div>
            <div className={styles.cardBody}>
              <label className={styles.checkRow}>
                <input type="checkbox" checked={faceDetectEnabled}
                  onChange={e => onFaceDetectChange(e.target.checked)}
                  disabled={!cameraOn}
                  style={{ accentColor:'var(--accent)', width:14, height:14 }} />
                <span style={{ fontSize:12, color: cameraOn ? 'var(--muted2)' : 'var(--muted)' }}>
                  {ja ? '顔検出を有効にする' : 'Enable face detection'}
                  {!cameraOn && <span style={{ fontSize:10, marginLeft:4, color:'var(--muted)' }}>({ja ? 'カメラをONにしてください' : 'Please enable camera'})</span>}
                </span>
              </label>
              {faceDetectEnabled && cameraOn && (
                <>
                  <div className={styles.row}>
                    <span className={styles.label}>{ja ? '警告までの時間' : 'Alert after'}</span>
                    <select value={noFaceThreshold} onChange={e => onNoFaceThresholdChange(Number(e.target.value))} className={styles.select}>
                      <option value={30}>{ja ? '30秒（厳しめ）' : '30s (strict)'}</option>
                      <option value={60}>{ja ? '1分' : '1 min'}</option>
                      <option value={120}>{ja ? '2分（トイレ・お茶）' : '2 min (toilet/drink)'}</option>
                      <option value={300}>{ja ? '5分（ストレッチ）' : '5 min (stretch)'}</option>
                      <option value={600}>{ja ? '10分（ゆるめ）' : '10 min (relaxed)'}</option>
                    </select>
                  </div>
                  <div className={styles.statusRow}>
                    <div className={styles.dot} style={{
                      background: faceStatus==='face_detected'?'#34d399':faceStatus==='no_face'?'#f87171':'#64748b'
                    }}/>
                    <span style={{ fontSize:11, color:'var(--muted2)' }}>
                      {faceStatus==='face_detected' ? (ja?'😊 顔を検出中':'😊 Face detected')
                        : faceStatus==='no_face' ? `😴 ${noFaceSeconds}${ja?'秒':'s'} / ${noFaceThreshold}${ja?'秒':'s'}`
                        : faceStatus==='checking' ? (ja?'🔍 確認中...':'🔍 Checking...')
                        : (ja?'待機中':'Standby')}
                    </span>
                    {faceStatus==='no_face' && (
                      <div className={styles.prog}><div className={styles.progFill} style={{ width:`${pct}%` }}/></div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Word filter */}
          <div className={styles.card} style={{ marginTop:6 }}>
            <div className={styles.cardHead}>
              <span style={{ fontSize:16 }}>🚫</span>
              <div>
                <div className={styles.cardTitle}>{ja ? '不適切ワードフィルター' : 'Word Filter'}</div>
                <div className={styles.cardDesc}>{ja ? '暴言・性的表現・外見差別を自動検知。送信前にブロックされます' : 'Auto-detects slurs, sexual content. Blocked before sending'}</div>
              </div>
              <span className={styles.badge} style={{ background:'rgba(52,211,153,.12)', color:'#34d399' }}>{ja ? '常時ON' : 'Always ON'}</span>
            </div>
          </div>

          {/* Inactivity detection */}
          <div className={styles.card} style={{ marginTop:6, opacity: awayEnabled ? 1 : 0.7 }}>
            <div className={styles.cardHead}>
              <span style={{ fontSize:16 }}>⌨️</span>
              <div>
                <div className={styles.cardTitle}>
                  {ja ? '操作なし検出' : 'Inactivity Detection'}
                  <span style={{ fontSize:10, color:'var(--muted)', fontWeight:400, marginLeft:6 }}>
                    {ja ? '（本読みには非推奨）' : '(not for reading)'}
                  </span>
                </div>
                <div className={styles.cardDesc}>{ja ? 'マウス・キーボード操作がない時間が続くと警告' : 'Alerts when no mouse/keyboard activity detected'}</div>
              </div>
            </div>
            <div className={styles.cardBody}>
              <label className={styles.checkRow}>
                <input type="checkbox" checked={awayEnabled}
                  onChange={e => onAwayEnabledChange(e.target.checked)}
                  style={{ accentColor:'var(--accent)', width:14, height:14 }}/>
                <span style={{ fontSize:12, color:'var(--muted2)' }}>{ja ? '有効にする（デフォルトOFF）' : 'Enable (default OFF)'}</span>
              </label>
              {awayEnabled && (
                <div className={styles.row}>
                  <span className={styles.label}>{ja ? '検出時間' : 'Threshold'}</span>
                  <select value={awayMinutes} onChange={e => onAwayMinutesChange(Number(e.target.value))} className={styles.select}>
                    {[1,3,5,10,15].map(m => <option key={m} value={m}>{m}{ja?'分':'min'}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
        </>)}
      </div>

      {/* ── 通知先 ── */}
      <div className={styles.section}>
        <button onClick={() => setShowNotifySettings(v => !v)}
          style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', background:'none', border:'none', cursor:'pointer', padding:0, marginBottom:8 }}>
          <div className={styles.sectionTitle} style={{ margin:0 }}>
            📨 {ja ? '離席検出の通知先' : 'Alert Recipient'}
            <span style={{ fontSize:10, fontWeight:400, color:'var(--muted)', marginLeft:6 }}>
              {ja ? '（オプション・PIN保護）' : '(Optional · PIN protected)'}
            </span>
          </div>
          <span style={{ fontSize:12, color:'var(--muted)' }}>{showNotifySettings ? '▲' : '▼'}</span>
        </button>

        {showNotifySettings && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>

            {/* PIN verification - show when PIN is set and not yet verified */}
            {savedPin && !pinVerified && (
              <div className={styles.pinBox}>
                <div style={{ fontSize:12, color:'#f1f5f9', marginBottom:8 }}>
                  🔐 {ja ? '設定を変更するにはPINを入力してください' : 'Enter PIN to change settings'}
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <input type="password" maxLength={4} value={pinInput}
                    onChange={e => { setPinInput(e.target.value); setPinError(false) }}
                    placeholder={ja ? '4桁PIN' : '4-digit PIN'}
                    style={{ width:90, padding:'8px 10px', background:'var(--bg2)',
                      border:`2px solid ${pinError?'#f87171':'var(--accent)'}`,
                      borderRadius:8, color:'var(--text)', fontSize:18,
                      textAlign:'center', letterSpacing:6, fontFamily:'inherit', outline:'none' }} />
                  <button onClick={() => {
                    if (pinInput === savedPin) { setPinVerified(true); setPinInput('') }
                    else { setPinError(true); setPinInput('') }
                  }} style={{ padding:'8px 16px', background:'var(--accent)', border:'none',
                    borderRadius:8, color:'#fff', fontSize:13, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>
                    {ja ? '確認' : 'Verify'}
                  </button>
                </div>
                {pinError && (
                  <div style={{ fontSize:12, color:'#f87171', marginTop:6 }}>
                    ❌ {ja ? 'PINが違います' : 'Incorrect PIN'}
                  </div>
                )}
              </div>
            )}

            {/* Settings - only show when verified */}
            {pinVerified && (<>

              {/* Set PIN if not set */}
              {!savedPin && (
                <div className={styles.row}>
                  <span className={styles.label}>🔐 {ja ? '変更防止PIN設定' : 'Set lock PIN'}</span>
                  <input type="password" maxLength={4} value={newPin}
                    onChange={e => setNewPin(e.target.value)}
                    placeholder={ja ? '4桁（任意）' : '4 digits (opt)'}
                    style={{ width:100, padding:'5px 10px', background:'var(--bg2)',
                      border:'1px solid var(--border)', borderRadius:6, color:'var(--text)',
                      fontSize:14, textAlign:'center', letterSpacing:4, fontFamily:'inherit', outline:'none' }} />
                </div>
              )}

              {/* Change PIN if already set */}
              {savedPin && (
                <div className={styles.row}>
                  <span className={styles.label}>🔐 {ja ? 'PIN変更' : 'Change PIN'}</span>
                  <input type="password" maxLength={4} value={newPin}
                    onChange={e => setNewPin(e.target.value)}
                    placeholder={ja ? '新しい4桁PIN' : 'New 4-digit PIN'}
                    style={{ width:120, padding:'5px 10px', background:'var(--bg2)',
                      border:'1px solid var(--border)', borderRadius:6, color:'var(--text)',
                      fontSize:14, textAlign:'center', letterSpacing:4, fontFamily:'inherit', outline:'none' }} />
                </div>
              )}

              {/* Notification method */}
              <div className={styles.row}>
                <span className={styles.label}>{ja ? '通知方法' : 'Method'}</span>
                <div style={{ display:'flex', gap:6 }}>
                  {(['none','email'] as const).map(m => (
                    <button key={m} onClick={() => setNotifyMethod(m)}
                      style={{ padding:'5px 12px', borderRadius:6,
                        border:`1px solid ${notifyMethod===m?'var(--accent)':'var(--border)'}`,
                        background: notifyMethod===m?'rgba(108,138,255,.12)':'transparent',
                        color: notifyMethod===m?'var(--accent)':'var(--muted)',
                        fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
                      {m==='none' ? (ja?'通知なし':'No notification') : (ja?'📧 メール':'📧 Email')}
                    </button>
                  ))}
                </div>
              </div>

              {notifyMethod === 'email' && (<>
                <div className={styles.row}>
                  <span className={styles.label}>{ja ? '通知先メール' : 'Alert email'}</span>
                  <input type="email" value={parentEmail}
                    onChange={e => setParentEmail(e.target.value)}
                    placeholder={ja ? '通知先メールアドレス' : 'Alert email address'}
                    className={styles.input} />
                </div>

                {/* Sample notification message */}
                <div className={styles.infoBox}>
                  <div style={{ fontSize:11, fontWeight:600, color:'#f1f5f9', marginBottom:6 }}>
                    📧 {ja ? '送信されるメッセージ例' : 'Sample notification message'}
                  </div>
                  <div style={{ fontSize:10, color:'#9ca3af', lineHeight:1.7, background:'var(--bg)', borderRadius:6, padding:'8px 10px' }}>
                    {ja ? (
                      <>
                        件名：【自習室JP】離席を検出しました<br/>
                        ───────────────<br/>
                        ⚠️ 離席検出のお知らせ<br/>
                        <br/>
                        お子様のアカウントで以下を検出しました：<br/>
                        😴 顔が2分間検出されませんでした<br/>
                        📅 検出時刻：2024/1/15 14:32<br/>
                        🏠 勉強部屋：Room 1<br/>
                        ───────────────<br/>
                        Study With Me JP
                      </>
                    ) : (
                      <>
                        Subject: [Study With Me JP] Absence detected<br/>
                        ───────────────<br/>
                        ⚠️ Absence Alert<br/>
                        <br/>
                        The following was detected:<br/>
                        😴 Face not detected for 2 minutes<br/>
                        📅 Time: 2024/1/15 14:32<br/>
                        🏠 Room: Room 1<br/>
                        ───────────────<br/>
                        Study With Me JP
                      </>
                    )}
                  </div>
                  <div style={{ fontSize:10, color:'#9ca3af', marginTop:6 }}>
                    📋 {ja ? '通知タイミング：顔未検出・別タブ3回以上・不適切ワード検出時' : 'Triggers: face absent, 3+ tab switches, inappropriate word detected'}
                  </div>
                </div>
              </>)}

              <button onClick={save} disabled={saving || (notifyMethod==='email' && !parentEmail)}
                style={{ width:'100%', padding:'10px', background:'var(--accent)', border:'none',
                  borderRadius:8, color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer',
                  fontFamily:'inherit', opacity: (notifyMethod==='email' && !parentEmail) ? 0.5 : 1 }}>
                {saving ? (ja?'保存中...':'Saving...') : saved ? (ja?'✅ 保存しました！':'✅ Saved!') : (ja?'保存する':'Save')}
              </button>
            </>)}

          </div>
        )}
      </div>

    </div>
  )
}
