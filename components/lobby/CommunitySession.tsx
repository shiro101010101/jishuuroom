'use client'
// components/lobby/CommunitySession.tsx — 毎日の「みんなで勉強」タイム（21:00 / 23:00 JST）の案内とカウントダウン
// 開始から 50 分間は「いま開催中」。人数はロビーのサーバー側で数えた値を受け取る（DB 追加なし）
import { useEffect, useState } from 'react'
import Link from 'next/link'
import styles from './Lobby.module.css'

export const COMMUNITY_ROOM_ID = '00000000-0000-0000-0000-000000000001' // Room 1
const HOURS_JST = [21, 23]
const LIVE_MS = 50 * 60_000
const JST_MS = 9 * 3_600_000

type Slot = { start: number; live: boolean }

/** いま開催中の回、なければ次の回 */
function currentSlot(now: number): Slot {
  const j = new Date(now + JST_MS)
  const y = j.getUTCFullYear(), m = j.getUTCMonth(), d = j.getUTCDate()
  for (let off = -1; off <= 1; off++) {
    for (const h of HOURS_JST) {
      const start = Date.UTC(y, m, d + off, h) - JST_MS
      if (now >= start && now < start + LIVE_MS) return { start, live: true }
      if (start > now) return { start, live: false }
    }
  }
  return { start: Date.UTC(y, m, d + 1, HOURS_JST[0]) - JST_MS, live: false }
}

const jstDay = (t: number) => Math.floor((t + JST_MS) / 86_400_000)
const pad = (n: number) => String(n).padStart(2, '0')

function countdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h > 0 ? `${h}時間${pad(m)}分` : `${pad(m)}:${pad(sec)}`
}

export default function CommunitySession({ studying }: { studying: number }) {
  // サーバーと時刻がずれて表示が食い違わないよう、時計はマウント後に動かす
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const slot = now == null ? null : currentSlot(now)
  const startLabel = slot ? `${new Date(slot.start + JST_MS).getUTCHours()}:00` : '21:00 / 23:00'
  const dayLabel = slot && now != null ? (jstDay(slot.start) === jstDay(now) ? '今日' : '明日') : '毎日'
  const href = `/room/${COMMUNITY_ROOM_ID}?start=1`

  return (
    <section className={`${styles.community} ${slot?.live ? styles.communityLive : ''}`} aria-label="みんなで勉強タイム">
      <div className={styles.communityBody}>
        <div className={styles.communityEyebrow}>
          {slot?.live ? <><i className={styles.dot}/>いま開催中</> : '毎日 21:00 と 23:00（日本時間）'}
        </div>
        <div className={styles.communityTitle}>
          {slot?.live
            ? <>みんなで勉強 <span className={styles.communityMeta}>{startLabel} の回 ・ {studying > 0 ? `${studying}人が勉強中` : '最初のひとりになろう'}</span></>
            : <>次の「みんなで勉強」は {dayLabel} {startLabel}</>}
        </div>
        {!slot?.live && (
          <div className={styles.communityCount} aria-live="off">
            {slot && now != null ? <>開始まで <b>{countdown(slot.start - now)}</b></> : ' '}
          </div>
        )}
        {slot?.live && now != null && (
          <div className={styles.communityCount}>のこり <b>{countdown(slot.start + LIVE_MS - now)}</b> ・ 自由学習ルームで 50 分間いっしょに集中します</div>
        )}
      </div>
      <Link href={href} className={styles.communityBtn}>{slot?.live ? 'いま参加する' : 'その時間に入る'}</Link>
    </section>
  )
}
