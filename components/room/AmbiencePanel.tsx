'use client'
// 環境音パネル：好きな音を重ねて、それぞれの音量を調整できる
import { AMBIENCE, type AmbienceId, type useAmbience } from '@/hooks/useAmbience'
import styles from './AmbiencePanel.module.css'

const GLYPH: Record<AmbienceId, React.ReactNode> = {
  rain: <path d="M16 13V8a4 4 0 0 0-8 0M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25M8 19v2M8 13v2M16 19v2M16 13v2M12 21v2M12 15v2"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  crickets: <path d="M12 3c-2.5 3-4 6-4 9a4 4 0 0 0 8 0c0-3-1.5-6-4-9zM12 16v5M8 21h8"/>,
  room: <path d="M3 21V10l9-7 9 7v11M9 21v-6h6v6"/>,
}

export default function AmbiencePanel({ ambience, lang }: { ambience: ReturnType<typeof useAmbience>; lang: 'ja' | 'en' }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span>{lang === 'ja' ? '環境音' : 'Ambience'}</span>
        <span className={styles.hint}>{lang === 'ja' ? '重ねて流せます' : 'Mix as you like'}</span>
      </div>
      {AMBIENCE.map(a => {
        const on = ambience.active.includes(a.id)
        return (
          <div key={a.id} className={`${styles.row} ${on ? styles.on : ''}`}>
            <button className={styles.toggle} onClick={() => ambience.toggle(a.id)} aria-pressed={on}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{GLYPH[a.id]}</svg>
              <span>{lang === 'ja' ? a.ja : a.en}</span>
            </button>
            <input type="range" className={styles.slider} min="0" max="1" step="0.01" value={ambience.levels[a.id]}
              aria-label={`${lang === 'ja' ? a.ja : a.en} の音量`}
              style={{ '--v': `${ambience.levels[a.id] * 100}%` } as React.CSSProperties}
              onChange={e => ambience.setLevel(a.id, parseFloat(e.target.value))}/>
          </div>
        )
      })}
    </div>
  )
}
