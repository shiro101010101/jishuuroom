'use client'
import { useState } from 'react'
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
  const ja = lang === 'ja'

  const [showDetectionSettings, setShowDetectionSettings] = useState(true)

  const pct = noFaceThreshold > 0 ? Math.min(100, Math.round((noFaceSeconds / noFaceThreshold) * 100)) : 0

  return (
    <div className={styles.wrap}>

      {/* ── 検出システム説明 ── */}
      <div className={styles.section}>
        <button onClick={() => setShowDetectionSettings(v => !v)}
          style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', minHeight:36, background:'none', border:'none', cursor:'pointer', padding:0, marginBottom:8 }}>
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

          {/* Face detection - BlazeFace AI */}
          <div className={styles.card} style={{ borderColor: faceDetectEnabled && cameraOn ? 'rgba(125,149,255,.3)' : 'var(--border)', marginTop:6 }}>
            <div className={styles.cardHead}>
              <span style={{ fontSize:16 }}>🤖</span>
              <div>
                <div className={styles.cardTitle}>{ja ? 'AI顔検出 (BlazeFace)' : 'AI Face Detection (BlazeFace)'}</div>
                <div className={styles.cardDesc}>{ja ? 'GoogleのAIで顔を検出。初回のみ読み込みに数秒かかります。データ外部送信なし🔒' : "Google's AI detects your face. First load takes a few seconds. No data sent🔒"}</div>
              </div>
              <span className={styles.badge} style={{
                background: faceDetectEnabled && cameraOn ? 'rgba(125,149,255,.12)' : 'var(--bg3)',
                color: faceDetectEnabled && cameraOn ? 'var(--accent)' : 'var(--muted)'
              }}>
                {faceStatus === 'loading' ? (ja?'読込中':'Loading')
                  : cameraOn ? (faceDetectEnabled ? 'ON' : 'OFF') : (ja?'カメラOFF':'Cam OFF')}
              </span>
            </div>
            <div className={styles.cardBody}>
              <label className={styles.checkRow}>
                <input type="checkbox" checked={faceDetectEnabled}
                  onChange={e => onFaceDetectChange(e.target.checked)}
                  disabled={!cameraOn}
                  style={{ accentColor:'var(--accent)', width:14, height:14 }} />
                <span style={{ fontSize:12, color: cameraOn ? 'var(--muted2)' : 'var(--muted)' }}>
                  {ja ? 'AI顔検出を有効にする' : 'Enable AI face detection'}
                  {!cameraOn && <span style={{ fontSize:10, marginLeft:4 }}>({ja?'カメラをONにしてください':'Enable camera first'})</span>}
                </span>
              </label>
              {faceDetectEnabled && cameraOn && (
                <>
                  <div className={styles.row}>
                    <span className={styles.label}>{ja ? '警告までの時間' : 'Alert after'}</span>
                    <select value={noFaceThreshold} onChange={e => onNoFaceThresholdChange(Number(e.target.value))} className={styles.select}>
                      <option value={30}>{ja ? '30秒' : '30s'}</option>
                      <option value={60}>{ja ? '1分' : '1min'}</option>
                      <option value={120}>{ja ? '2分（おすすめ）' : '2min (recommended)'}</option>
                      <option value={300}>{ja ? '5分' : '5min'}</option>
                      <option value={600}>{ja ? '10分' : '10min'}</option>
                    </select>
                  </div>
                  <div className={styles.statusRow}>
                    <div className={styles.dot} style={{
                      background: faceStatus==='face_detected'?'#34d399'
                        :faceStatus==='no_face'?'#f87171'
                        :faceStatus==='loading'?'#fbbf24':'#64748b'
                    }}/>
                    <span style={{ fontSize:11, color:'var(--muted2)' }}>
                      {faceStatus==='loading' ? (ja?'🤖 AI読込中...':'🤖 Loading AI...')
                        :faceStatus==='face_detected' ? (ja?'😊 顔を検出中':'😊 Face detected')
                        :faceStatus==='no_face' ? `😴 ${noFaceSeconds}${ja?'秒':'s'} / ${noFaceThreshold}${ja?'秒':'s'}`
                        :faceStatus==='checking' ? (ja?'🔍 確認中...':'🔍 Checking...')
                        :(ja?'待機中':'Standby')}
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

      {/* ── 保護者への通知（メール送信の仕組みができるまで非表示。できないことを「できる」と見せない） ── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>📨 {ja ? '保護者への通知' : 'Parent notifications'}</div>
        <div className={styles.cardDesc} style={{ lineHeight: 1.7 }}>
          {ja ? '保護者へのメール通知は準備中です。離席の警告は、いまはこの画面の中でだけ表示されます。' : 'Email notifications to parents are coming soon. Away alerts are shown on this screen only.'}
        </div>
      </div>

    </div>
  )
}
