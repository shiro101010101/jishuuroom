// app/lobby/page.tsx — ロビー（ルーム選択・今日の記録・今日のトップ3）
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyStats, periodStart } from '@/lib/studyTime'
import LobbyHeader from '@/components/lobby/LobbyHeader'
import Greeting from '@/components/lobby/Greeting'
import styles from '@/components/lobby/Lobby.module.css'

export const dynamic = 'force-dynamic'

const fmt = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}時間${String(m).padStart(2, '0')}分` : `${m}分`
}

export default async function LobbyPage() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) redirect('/')

  const admin = createAdminClient()
  const [{ data: profile }, { data: rooms }, { data: members }, stats, { data: top }] = await Promise.all([
    admin.from('profiles').select('display_name, avatar_url, is_banned').eq('id', userId).maybeSingle(),
    admin.from('rooms').select('id, name, description, emoji').eq('is_private', false).order('name'),
    admin.from('room_members').select('room_id, status'),
    getMyStats(admin, userId),
    admin.rpc('get_leaderboard', { p_since: periodStart('day').toISOString(), p_user_ids: null, p_limit: 3 }),
  ])
  if (profile?.is_banned) redirect('/banned')

  const counts: Record<string, { total: number; studying: number }> = {}
  for (const m of members ?? []) {
    counts[m.room_id] ??= { total: 0, studying: 0 }
    counts[m.room_id].total++
    if (m.status === 'studying') counts[m.room_id].studying++
  }
  const name = profile?.display_name ?? session.user?.name ?? 'ゲスト'

  return (
    <div className={styles.page}>
      <LobbyHeader name={name} avatarUrl={profile?.avatar_url ?? session.user?.image ?? null}/>
      <main className={styles.main}>
        <section className={styles.hero}>
          <Greeting name={name}/>
          <div className={styles.stats}>
            <div className={styles.stat}><div className={styles.statVal}>{fmt(stats.todaySeconds)}</div><div className={styles.statLbl}>今日の勉強時間</div></div>
            <div className={styles.stat}><div className={styles.statVal}>{stats.streak}<span>日</span></div><div className={styles.statLbl}>連続日数</div></div>
            <div className={styles.stat}><div className={styles.statVal}>{stats.pomosToday}</div><div className={styles.statLbl}>ポモドーロ</div></div>
          </div>
        </section>

        <div className={styles.grid}>
          <section>
            <h2 className={styles.h2}>ルームを選ぶ</h2>
            <div className={styles.rooms}>
              {(rooms ?? []).map(r => {
                const c = counts[r.id] ?? { total: 0, studying: 0 }
                return (
                  <Link key={r.id} href={`/room/${r.id}`} className={styles.room}>
                    <span className={styles.roomEmoji}>{r.emoji}</span>
                    <span className={styles.roomBody}>
                      <span className={styles.roomName}>{r.name}</span>
                      <span className={styles.roomDesc}>{r.description}</span>
                    </span>
                    <span className={styles.roomCount}>
                      {c.total > 0 ? <><i className={styles.dot}/>{c.total}人</> : <span className={styles.muted}>空室</span>}
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
          </aside>
        </div>
      </main>
    </div>
  )
}
