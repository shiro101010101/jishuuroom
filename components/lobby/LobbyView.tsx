// components/lobby/LobbyView.tsx — ロビーの見た目（データの読み込みは app/lobby/page.tsx 側）
// デモ画面（app/demo/lobby）からも同じ見た目を使う
import Link from 'next/link'
import LobbyHeader from '@/components/lobby/LobbyHeader'
import Greeting from '@/components/lobby/Greeting'
import GoalOnboarding from '@/components/lobby/GoalOnboarding'
import CommunitySession, { COMMUNITY_ROOM_ID } from '@/components/lobby/CommunitySession'
import StudyGroups from '@/components/lobby/StudyGroups'
import PinsBox from '@/components/lobby/PinsBox'
import type { MyStats } from '@/lib/studyTime'
import { demoPins, demoStudyGroups } from '@/lib/demoData'
import styles from '@/components/lobby/Lobby.module.css'

type RoomLite = { id: string; name: string; description: string | null; emoji: string | null }

export type LobbyViewProps = {
  name: string
  avatarUrl: string | null
  bio: string | null
  needsGoal: boolean
  stats: MyStats
  quickRoom: RoomLite | undefined
  firstTime: boolean
  counts: Record<string, { total: number; studying: number }>
  invite?: string
  privateRooms: RoomLite[]
  rooms: RoomLite[]
  top: { user_id: string; rank: number; display_name: string; total_seconds: number | string }[]
  userId: string
  /** デモ画面のときは、部屋のリンクをデモの自習室に向ける */
  demo?: boolean
}

const fmt = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}時間${String(m).padStart(2, '0')}分` : `${m}分`
}

export default function LobbyView({ name, avatarUrl, bio, needsGoal, stats, quickRoom, firstTime, counts, invite, privateRooms, rooms, top, userId, demo = false }: LobbyViewProps) {
  const roomHref = (id: string, q = '') => demo ? '/demo/room' : `/room/${id}${q}`
  return (
    <div className={styles.page}>
      <LobbyHeader profile={{ display_name: name, avatar_url: avatarUrl, bio }}/>
      <main className={styles.main}>
        {needsGoal && <GoalOnboarding/>}

        <section className={styles.hero}>
          <Greeting name={name}/>
          <div className={styles.stats}>
            <div className={styles.stat}><div className={styles.statVal}>{fmt(stats.todaySeconds)}</div><div className={styles.statLbl}>今日の勉強時間</div></div>
            <div className={styles.stat}><div className={styles.statVal}>{stats.streak}<span>日</span></div><div className={styles.statLbl}>連続日数</div></div>
            <div className={styles.stat}><div className={styles.statVal}>{stats.pomosToday}</div><div className={styles.statLbl}>ポモドーロ</div></div>
          </div>
        </section>

        {quickRoom && (
          <Link href={roomHref(quickRoom.id, '?start=1')} className={styles.quick}>
            <span className={styles.quickIcon}>▶</span>
            <span className={styles.quickBody}>
              <span className={styles.quickTitle}>{firstTime ? 'まずは 25 分だけ、やってみよう' : '今すぐ集中をはじめる'}</span>
              <span className={styles.quickDesc}>
                {quickRoom.emoji} {quickRoom.name}
                {(counts[quickRoom.id]?.total ?? 0) > 0 ? ` ・ ${counts[quickRoom.id].total}人が勉強中` : ''}
                {firstTime ? ' ・ カメラは OFF のままで大丈夫' : ''}
              </span>
            </span>
          </Link>
        )}

        <CommunitySession studying={counts[COMMUNITY_ROOM_ID]?.total ?? 0}/>

        {invite === 'invalid' && <div className={styles.notice}>招待リンクが見つかりませんでした。部屋が削除されたか、リンクが間違っている可能性があります。</div>}
        {invite === 'denied' && <div className={styles.notice}>この部屋は友達だけの部屋です。招待リンクを送ってもらってください。</div>}

        {/* デモ画面ではサーバーの API を呼ばない */}
        {demo ? <StudyGroups demoData={demoStudyGroups}/> : <StudyGroups/>}

        <div className={styles.grid}>
          <section>
            {privateRooms.length > 0 && <div className={styles.section}>
              <h2 className={styles.h2}>これまでの友達部屋</h2>
              <div className={styles.rooms}>
                {privateRooms.map(r => {
                  const c = counts[r.id] ?? { total: 0, studying: 0 }
                  return (
                    <Link key={r.id} href={roomHref(r.id)} className={styles.room}>
                      <span className={styles.roomEmoji}>{r.emoji}</span>
                      <span className={styles.roomBody}>
                        <span className={styles.roomName}>{r.name}<span className={styles.lock}>🔒 友達だけ</span></span>
                        <span className={styles.roomDesc}>{r.description}</span>
                      </span>
                      <span className={styles.roomCount}>
                        {c.total > 0 ? <><i className={styles.dot}/>{c.total}人</> : <span className={styles.muted}>一番乗りしよう</span>}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>}

            <h2 className={styles.h2}>みんなの自習室</h2>
            <div className={styles.rooms}>
              {(rooms ?? []).map(r => {
                const c = counts[r.id] ?? { total: 0, studying: 0 }
                return (
                  <Link key={r.id} href={roomHref(r.id)} className={styles.room}>
                    <span className={styles.roomEmoji}>{r.emoji}</span>
                    <span className={styles.roomBody}>
                      <span className={styles.roomName}>{r.name}</span>
                      <span className={styles.roomDesc}>{r.description}</span>
                    </span>
                    <span className={styles.roomCount}>
                      {c.total > 0 ? <><i className={styles.dot}/>{c.total}人</> : <span className={styles.muted}>一番乗りしよう</span>}
                    </span>
                  </Link>
                )
              })}
            </div>
          </section>

          <aside>
            <h2 className={styles.h2}>今日のトップ3</h2>
            <div className={styles.top}>
              {(top ?? []).map((r: any) => (
                <div key={r.user_id} className={`${styles.topRow} ${r.user_id === userId ? styles.topMe : ''}`}>
                  <span className={`${styles.rank} ${styles['rank' + r.rank] ?? ''}`}>{r.rank}</span>
                  <span className={styles.topName}>{r.display_name}</span>
                  <span className={styles.topTime}>{fmt(Number(r.total_seconds))}</span>
                </div>
              ))}
              {(!top || top.length === 0) && <div className={styles.empty}>今日はまだ誰も記録していません。<br/>最初の1位をねらいましょう。</div>}
            </div>
            {demo ? <PinsBox demoData={demoPins}/> : <PinsBox/>}
          </aside>
        </div>
      </main>
      <footer className={styles.footer}>
        <Link href="/premium">✦ プレミアム</Link>
        <Link href="/terms">利用規約</Link>
        <Link href="/privacy">プライバシーポリシー</Link>
        <Link href="/tokushoho">特定商取引法に基づく表記</Link>
      </footer>
    </div>
  )
}
