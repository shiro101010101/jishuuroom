// app/api/cron/sessions/route.ts — 勉強会の開始前通知（5 分おき。Supabase pg_cron から呼ぶ。migration_session_cron.sql）
// 1. 終わった定期勉強会の scheduled_at を次の回へ進める（reminded_at はそのまま → 次の回でまた通知される）
// 2. 15 分以内に始まる回のうち、まだ通知していないものを 1 回だけ参加者に通知する
// `Authorization: Bearer ${CRON_SECRET}` が必要
import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { pushEnabled } from '@/lib/push'
import { formatJstTime, nextOccurrence } from '@/lib/studyGroups'
import { pushToUsers, type SessionRow } from '@/lib/studyGroupsServer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const LEAD_MS = 15 * 60_000
/** 開始後これ以内なら、遅れても通知する（cron が遅れたとき用） */
const LATE_MS = 5 * 60_000

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const got = Buffer.from(request.headers.get('authorization') ?? '')
  const want = Buffer.from(`Bearer ${secret}`)
  return got.length === want.length && timingSafeEqual(got, want)
}

async function handle(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()
  const now = Date.now()
  const cols = 'id, host_id, room_id, title, scheduled_at, duration_mins, repeat_days, reminded_at'

  // 1. 定期勉強会を次の回へ
  let rolled = 0
  const { data: past, error: pastErr } = await admin.from('scheduled_sessions').select(cols)
    .lt('scheduled_at', new Date(now).toISOString()).neq('repeat_days', '{}').limit(500)
  if (pastErr) { console.error('cron sessions past error:', pastErr); return NextResponse.json({ error: 'db' }, { status: 500 }) }
  for (const s of (past ?? []) as SessionRow[]) {
    const base = new Date(s.scheduled_at).getTime()
    if (base + s.duration_mins * 60_000 > now) continue // まだ開催中
    const next = nextOccurrence(base, s.repeat_days, s.duration_mins, now)
    if (next === null || next === base) continue
    const { error } = await admin.from('scheduled_sessions').update({ scheduled_at: new Date(next).toISOString() })
      .eq('id', s.id).eq('scheduled_at', s.scheduled_at)
    if (!error) rolled++
  }

  // 2. まもなく始まる回を通知
  if (!pushEnabled()) return NextResponse.json({ ok: true, rolled, skipped: 'push disabled' })
  const { data: soon, error: soonErr } = await admin.from('scheduled_sessions').select(cols)
    .gte('scheduled_at', new Date(now - LATE_MS).toISOString())
    .lte('scheduled_at', new Date(now + LEAD_MS).toISOString())
    .limit(500)
  if (soonErr) { console.error('cron sessions soon error:', soonErr); return NextResponse.json({ error: 'db' }, { status: 500 }) }

  let sessions = 0, reached = 0
  for (const s of (soon ?? []) as (SessionRow & { reminded_at: string | null })[]) {
    if (s.reminded_at && new Date(s.reminded_at).getTime() === new Date(s.scheduled_at).getTime()) continue
    // 先に「通知済み」にしてから送る（同時に 2 回呼ばれても二重に送らない）
    const claim = admin.from('scheduled_sessions').update({ reminded_at: s.scheduled_at }).eq('id', s.id).eq('scheduled_at', s.scheduled_at)
    const { data: claimed } = await (s.reminded_at ? claim.eq('reminded_at', s.reminded_at) : claim.is('reminded_at', null)).select('id')
    if (!claimed || claimed.length === 0) continue

    const { data: parts } = await admin.from('session_participants').select('user_id').eq('session_id', s.id).limit(100)
    const userIds = (parts ?? []).map((p: { user_id: string }) => p.user_id)
    if (userIds.length === 0) continue
    const start = new Date(s.scheduled_at).getTime()
    const mins = Math.max(0, Math.round((start - now) / 60_000))
    sessions++
    reached += await pushToUsers(admin, userIds, {
      title: mins > 0 ? `⏰ あと${mins}分で勉強会がはじまります` : '⏰ 勉強会がはじまりました',
      body: `「${s.title}」${formatJstTime(start)}〜 ${s.duration_mins}分 · タップして入室`,
      url: s.room_id ? `/room/${s.room_id}` : '/lobby#study-groups',
      tag: `session-${s.id}`.slice(0, 64),
    })
  }

  return NextResponse.json({ ok: true, rolled, sessions, reached })
}

export const GET = handle
export const POST = handle
