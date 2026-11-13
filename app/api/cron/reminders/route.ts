// app/api/cron/reminders/route.ts — 連続記録が今日切れそうな人に、やさしくお知らせする（毎日 21:00 JST）
// Vercel Cron から `Authorization: Bearer ${CRON_SECRET}` 付きで呼ばれる
// 対象：通知を購読していて、昨日は勉強したのに今日（JST）はまだ記録がなく、20 時間以内に通知していない人
import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { pushEnabled, sendPush, type StoredSub } from '@/lib/push'
import { computeStreak, dayIndex, periodStart } from '@/lib/studyTime'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const DAY_MS = 86_400_000
const RENOTIFY_MS = 20 * 60 * 60 * 1000
const CHUNK = 50
const CONCURRENCY = 10

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const got = Buffer.from(request.headers.get('authorization') ?? '')
  const want = Buffer.from(`Bearer ${secret}`)
  return got.length === want.length && timingSafeEqual(got, want)
}

type SubRow = StoredSub & { id: string; user_id: string; last_sent_at: string | null }

async function handle(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!pushEnabled()) return NextResponse.json({ ok: true, skipped: 'push disabled' })

  const admin = createAdminClient()
  const now = new Date()
  const cutoff = new Date(now.getTime() - RENOTIFY_MS).toISOString()

  // 1. 20 時間以内に通知していない購読
  const subs: SubRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth, last_sent_at')
      .or(`last_sent_at.is.null,last_sent_at.lt.${cutoff}`)
      .order('id').range(from, from + 999)
    if (error) { console.error('cron subs error:', error); return NextResponse.json({ error: 'db' }, { status: 500 }) }
    subs.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  // 同じ人の別の端末に最近送っていたら、その人には送らない
  const { data: recent } = await admin.from('push_subscriptions').select('user_id').gte('last_sent_at', cutoff)
  const recentlyNotified = new Set((recent ?? []).map(r => r.user_id))
  const byUser = new Map<string, SubRow[]>()
  for (const s of subs) {
    if (recentlyNotified.has(s.user_id)) continue
    byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s])
  }

  // 2. 対象者の勉強記録（昨日まで続いていて、今日はまだ）
  const today = dayIndex(now)
  const since = new Date(periodStart('day', now).getTime() - 400 * DAY_MS).toISOString()
  const targets: { userId: string; streak: number }[] = []
  const userIds = [...byUser.keys()]
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const ids = userIds.slice(i, i + CHUNK)
    const { data: banned } = await admin.from('profiles').select('id').in('id', ids).eq('is_banned', true)
    // 1 回の取得は最大 1000 行（PostgREST の上限）なのでページ分けして全部読む
    const sessions: { user_id: string; started_at: string }[] = []
    let error: unknown = null
    for (let from = 0; ; from += 1000) {
      const res = await admin.from('study_sessions').select('id, user_id, started_at')
        .in('user_id', ids).gte('started_at', since).gt('duration_seconds', 0)
        .order('id').range(from, from + 999)
      if (res.error) { error = res.error; break }
      sessions.push(...(res.data ?? []))
      if (!res.data || res.data.length < 1000) break
    }
    if (error) { console.error('cron sessions error:', error); continue }
    const bannedSet = new Set((banned ?? []).map(b => b.id))
    const days = new Map<string, Set<number>>()
    for (const s of sessions) {
      const set = days.get(s.user_id) ?? new Set<number>()
      set.add(dayIndex(new Date(s.started_at)))
      days.set(s.user_id, set)
    }
    for (const id of ids) {
      const d = days.get(id)
      if (bannedSet.has(id) || !d || d.has(today) || !d.has(today - 1)) continue
      targets.push({ userId: id, streak: computeStreak(d, now) })
    }
  }

  // 3. 送信（無効になった購読は削除）
  let sent = 0, removed = 0, failed = 0
  const gone: string[] = []
  const notified: string[] = []
  const jobs = targets.flatMap(t => (byUser.get(t.userId) ?? []).map(sub => ({ sub, streak: t.streak })))
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const results = await Promise.all(jobs.slice(i, i + CONCURRENCY).map(async ({ sub, streak }) => {
      const r = await sendPush(sub, {
        title: `🔥 連続${streak}日、今日も少しだけ`,
        body: '5分だけでも、記録はつながります。みんなと一緒にもうひと息。',
        url: '/lobby',
        tag: 'streak-reminder',
      })
      return { sub, r }
    }))
    for (const { sub, r } of results) {
      if (r === 'ok') { sent++; notified.push(sub.id) }
      else if (r === 'gone') { removed++; gone.push(sub.id) }
      else failed++
    }
  }
  for (let i = 0; i < gone.length; i += CHUNK) {
    await admin.from('push_subscriptions').delete().in('id', gone.slice(i, i + CHUNK))
  }
  for (let i = 0; i < notified.length; i += CHUNK) {
    await admin.from('push_subscriptions').update({ last_sent_at: now.toISOString() }).in('id', notified.slice(i, i + CHUNK))
  }

  return NextResponse.json({ ok: true, candidates: byUser.size, targets: targets.length, sent, removed, failed })
}

export const GET = handle
export const POST = handle
