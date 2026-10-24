// app/api/study/heartbeat/route.ts
// 勉強時間はここでだけ記録する。加算量はサーバーの時計で決めるので、
// クライアントが連打しても実時間以上には増えない。
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MAX_CREDIT_SEC, SESSION_GAP_SEC, dayIndex, getMyStats } from '@/lib/studyTime'

type Phase = 'start' | 'tick' | 'stop' | 'pomodoro'
const PHASES: Phase[] = ['start', 'tick', 'stop', 'pomodoro']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // sendBeacon は text/plain で送られてくるので text として読む
  let body: { phase?: string; roomId?: string; pomodoro?: boolean } = {}
  try { body = JSON.parse(await request.text()) } catch {}
  const phase = body.phase as Phase
  if (!PHASES.includes(phase)) return NextResponse.json({ error: 'invalid phase' }, { status: 400 })
  const roomId = body.roomId && UUID_RE.test(body.roomId) ? body.roomId : null
  const pomodoroDone = phase === 'pomodoro' || body.pomodoro === true

  const admin = createAdminClient()
  const now = new Date()
  const nowIso = now.toISOString()

  const { data: profile } = await admin.from('profiles').select('is_banned, total_study_seconds').eq('id', userId).single()
  if (!profile || profile.is_banned) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: open } = await admin
    .from('study_sessions')
    .select('id, started_at, duration_seconds, pomodoros_completed, last_heartbeat_at')
    .eq('user_id', userId)
    .not('last_heartbeat_at', 'is', null)
    .order('last_heartbeat_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const gapSec = open ? (now.getTime() - new Date(open.last_heartbeat_at).getTime()) / 1000 : Infinity
  const alive = open && gapSec <= SESSION_GAP_SEC
  let credit = 0

  if (open && (!alive || phase === 'start')) {
    // 途切れたセッション / 新しく開始 → 前のセッションは加算せずに閉じる
    await admin.from('study_sessions').update({ last_heartbeat_at: null }).eq('id', open.id)
  }

  if (phase === 'start' || !alive) {
    if (phase !== 'stop') {
      await admin.from('study_sessions').insert({
        user_id: userId, room_id: roomId, started_at: nowIso, ended_at: nowIso,
        duration_seconds: 0, pomodoros_completed: pomodoroDone ? 1 : 0,
        last_heartbeat_at: nowIso,
      })
    }
  } else {
    credit = Math.max(0, Math.min(Math.round(gapSec), MAX_CREDIT_SEC))
    const pomos = (open.pomodoros_completed ?? 0) + (pomodoroDone ? 1 : 0)
    const crossedMidnight = dayIndex(new Date(open.started_at)) !== dayIndex(now)

    if (crossedMidnight && phase !== 'stop') {
      // 日付をまたいだら、その日の分として新しいセッションに切り替える
      await admin.from('study_sessions').update({ last_heartbeat_at: null, ended_at: nowIso }).eq('id', open.id)
      await admin.from('study_sessions').insert({
        user_id: userId, room_id: roomId, started_at: nowIso, ended_at: nowIso,
        duration_seconds: credit, pomodoros_completed: pomodoroDone ? 1 : 0,
        last_heartbeat_at: nowIso,
      })
    } else {
      // 楽観ロック：同時に来た別リクエストが先に加算していたら、こちらは加算しない
      const { data: updated } = await admin.from('study_sessions').update({
        duration_seconds: (open.duration_seconds ?? 0) + credit,
        pomodoros_completed: pomos,
        ended_at: nowIso,
        last_heartbeat_at: phase === 'stop' ? null : nowIso,
      }).eq('id', open.id).eq('last_heartbeat_at', open.last_heartbeat_at).select('id')
      if (!updated?.length) credit = 0
    }
  }

  if (credit > 0) {
    await admin.from('profiles')
      .update({ total_study_seconds: Number(profile.total_study_seconds ?? 0) + credit })
      .eq('id', userId)
  }

  // tick は毎分来るので重い集計は返さない
  if (phase === 'tick') return NextResponse.json({ credited: credit })

  const stats = await getMyStats(admin, userId)
  await admin.from('profiles').update({ study_streak: stats.streak }).eq('id', userId)
  return NextResponse.json({ credited: credit, stats })
}
