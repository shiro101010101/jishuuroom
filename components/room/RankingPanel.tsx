'use client'
import { useEffect, useState, useCallback } from 'react'
import styles from './RankingPanel.module.css'

type Period = 'day' | 'week' | 'month'
type Scope = 'global' | 'friends' | 'room'
type Row = { user_id: string; display_name: string; avatar_url: string | null; study_streak: number; total_seconds: number; rank: number }
type Me = { total_seconds: number; rank: number | null; participants: number } | null

type Props = {
  userId: string
  roomId: string
  lang?: 'ja' | 'en'
  /** 自分の勉強時間が更新されたら変わる値（再取得のきっかけ） */
  refreshKey?: number
}

const fmt = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return m > 0 ? `${m}m` : `${Math.max(0, Math.round(s))}s`
}

export default function RankingPanel({ userId, roomId, lang = 'ja', refreshKey = 0 }: Props) {
  const ja = lang === 'ja'
  const [period, setPeriod] = useState<Period>('day')
  const [scope, setScope] = useState<Scope>('global')
  const [rows, setRows] = useState<Row[]>([])
  const [me, setMe] = useState<Me>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/leaderboard?period=${period}&scope=${scope}&roomId=${roomId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setRows(json.rows); setMe(json.me)
    } catch (e: any) {
      setError(e?.message || (ja ? '読み込みに失敗しました' : 'Failed to load'))
    } finally { setLoading(false) }
  }, [period, scope, roomId])

  useEffect(() => { load() }, [load, refreshKey])
  // 開いている間は1分ごとに更新
  useEffect(() => { const t = setInterval(load, 60_000); return () => clearInterval(t) }, [load])

  const top = rows[0]?.total_seconds || 1
  const meInList = rows.some(r => r.user_id === userId)

  return (
    <div className={styles.wrap}>
      <div className={styles.seg}>
        {(['day', 'week', 'month'] as const).map(p => (
          <button key={p} className={period === p ? styles.segOn : ''} onClick={() => setPeriod(p)}>
            {ja ? { day: '今日', week: '今週', month: '今月' }[p] : { day: 'Today', week: 'Week', month: 'Month' }[p]}
          </button>
        ))}
      </div>
      <div className={styles.seg}>
        {(['global', 'friends', 'room'] as const).map(s => (
          <button key={s} className={scope === s ? styles.segOn : ''} onClick={() => setScope(s)}>
            {ja ? { global: '全体', friends: 'フレンド', room: 'ルーム' }[s] : { global: 'Global', friends: 'Friends', room: 'Room' }[s]}
          </button>
        ))}
      </div>

      {/* 自分の順位 */}
      <div className={styles.meCard}>
        <div>
          <div className={styles.meLbl}>{ja ? 'あなたの順位' : 'Your rank'}</div>
          <div className={styles.meRank}>
            {me?.rank ? <>#{me.rank}<span> / {me.participants}{ja ? '人' : ''}</span></> : <span>{ja ? 'まだ記録なし' : 'Not ranked yet'}</span>}
          </div>
        </div>
        <div className={styles.meTime}>{fmt(me?.total_seconds ?? 0)}</div>
      </div>
      {me?.rank && me.rank > 1 && rows.length > 0 && (() => {
        const above = rows.filter(r => r.rank < me.rank!).pop()
        const diff = above ? above.total_seconds - me.total_seconds : 0
        return above && diff > 0 ? (
          <div className={styles.hint}>{ja ? `あと ${fmt(diff)} で ${above.display_name} さんを抜けます` : `${fmt(diff)} more to pass ${above.display_name}`}</div>
        ) : null
      })()}

      {error && <div className={styles.error}>{error}</div>}
      {loading && rows.length === 0 && !error && <div className={styles.empty}>{ja ? '読み込み中…' : 'Loading…'}</div>}
      {!loading && !error && rows.length === 0 && (
        <div className={styles.empty}>{ja ? 'まだ誰も記録していません。タイマーをスタートして1位を取ろう！' : 'No one yet — start the timer and take #1!'}</div>
      )}

      <div className={styles.list}>
        {rows.map(r => (
          <div key={r.user_id} className={`${styles.row} ${r.user_id === userId ? styles.rowMe : ''} ${r.rank <= 3 ? styles.rowTop : ''}`}>
            <span className={`${styles.rank} ${r.rank <= 3 ? styles[`rank${r.rank}`] : ''}`}>{r.rank}</span>
            <span className={styles.avatar}>
              {r.avatar_url ? <img src={r.avatar_url} alt="" /> : r.display_name?.[0]}
            </span>
            <span className={styles.nameCol}>
              <span className={styles.name}>{r.display_name}{r.study_streak > 1 && <span className={styles.streak}>{ja ? `${r.study_streak}日連続` : `${r.study_streak}d`}</span>}</span>
              <span className={styles.bar}><span style={{ width: `${Math.max(4, (r.total_seconds / top) * 100)}%` }} /></span>
            </span>
            <span className={styles.time}>{fmt(r.total_seconds)}</span>
          </div>
        ))}
        {!meInList && me?.rank && rows.length > 0 && <div className={styles.more}>⋯ #{me.rank} {ja ? 'あなた' : 'You'} · {fmt(me.total_seconds)}</div>}
      </div>
      <div className={styles.note}>{ja ? '※ タイマーで集中している時間だけが記録されます（日本時間で集計）' : '* Only focused timer time counts (JST day boundary)'}</div>
    </div>
  )
}
