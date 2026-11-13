// app/api/study-group/route.ts — 友達との勉強会（予約・定期開催・招待）
//   GET    自分に関係する勉強会の一覧 ＋ 招待できるフレンド ＋ 自分の友達部屋
//   POST   勉強会を作る（新しい友達部屋 or 自分の友達部屋で）。選んだフレンドを招待して通知する
//   PATCH  join（参加）/ decline（辞退）/ leave（参加をやめる）/ invite（フレンドを追加で招待）
//   DELETE 勉強会を削除（主催者だけ。部屋は残す）
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasNgWord } from '@/lib/wordFilter'
import { UUID_RE, MAIN_ROOM_IDS, grantRoomAccess, getMyPrivateRooms, listPublicRooms } from '@/lib/roomAccess'
import { getPlan, LIMITS } from '@/lib/premium'
import {
  MAX_DURATION, MIN_DURATION, MAX_TITLE, firstWeeklyStart, jstToUtc, nextOccurrence, parseRepeatDays,
} from '@/lib/studyGroups'
import { filterInvitableFriends, inviteToSession, pushToUsers, type SessionRow } from '@/lib/studyGroupsServer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_AHEAD_MS = 90 * 86_400_000
const SESSION_COLS = 'id, host_id, room_id, title, scheduled_at, duration_mins, repeat_days'

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

async function me() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return null
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('display_name, is_banned').eq('id', userId).maybeSingle()
  if (!profile || profile.is_banned) return { admin, userId, name: '', banned: true }
  return { admin, userId, name: profile.display_name ?? 'フレンド', banned: false }
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const text = await request.text()
    if (text.length > 8192) return {}
    const v = JSON.parse(text)
    return v && typeof v === 'object' ? v : {}
  } catch { return {} }
}

type Status = 'host' | 'going' | 'invited' | 'declined' | 'open'

export async function GET() {
  const ctx = await me()
  if (!ctx) return bad('Unauthorized', 401)
  if (ctx.banned) return bad('Forbidden', 403)
  const { admin, userId } = ctx
  const now = Date.now()

  const [hosted, parts, invites, rooms, friendRows, publicRooms] = await Promise.all([
    admin.from('scheduled_sessions').select(SESSION_COLS).eq('host_id', userId).limit(50),
    admin.from('session_participants').select('session_id').eq('user_id', userId).limit(200),
    admin.from('session_invites').select('session_id, status').eq('user_id', userId).limit(200),
    getMyPrivateRooms(admin, userId),
    admin.from('friendships').select('addressee_id').eq('requester_id', userId).eq('status', 'accepted').limit(200),
    listPublicRooms(admin),
  ])
  if (hosted.error) {
    console.error('study-group list error:', hosted.error)
    return bad('勉強会を読み込めませんでした（データベースの更新が必要かもしれません）', 500)
  }

  const partIds = new Set((parts.data ?? []).map(p => p.session_id as string))
  const inviteStatus = new Map((invites.data ?? []).map(i => [i.session_id as string, i.status as 'invited' | 'declined']))
  const roomIds = rooms.map(r => r.id as string)
  const known = new Set((hosted.data ?? []).map(s => s.id as string))
  const extraIds = [...new Set([...partIds, ...inviteStatus.keys()])].filter(id => !known.has(id))

  const [byId, byRoom] = await Promise.all([
    extraIds.length ? admin.from('scheduled_sessions').select(SESSION_COLS).in('id', extraIds.slice(0, 200)) : Promise.resolve({ data: [] }),
    roomIds.length ? admin.from('scheduled_sessions').select(SESSION_COLS).in('room_id', roomIds).limit(100) : Promise.resolve({ data: [] }),
  ])
  const all = new Map<string, SessionRow>()
  for (const s of [...(hosted.data ?? []), ...(byId.data ?? []), ...(byRoom.data ?? [])] as SessionRow[]) all.set(s.id, s)

  const active = [...all.values()]
    .map(s => ({ s, start: nextOccurrence(s.scheduled_at, s.repeat_days, s.duration_mins, now) }))
    .filter((x): x is { s: SessionRow; start: number } => x.start !== null)
    .sort((a, b) => a.start - b.start)
    .slice(0, 30)

  const ids = active.map(x => x.s.id)
  const [participants, roomInfo] = await Promise.all([
    ids.length ? admin.from('session_participants').select('session_id, user_id').in('session_id', ids).limit(1000) : Promise.resolve({ data: [] }),
    active.length ? admin.from('rooms').select('id, name, emoji, invite_code').in('id', [...new Set(active.map(x => x.s.room_id).filter(Boolean))] as string[]) : Promise.resolve({ data: [] }),
  ])
  const friendIds = (friendRows.data ?? []).map(f => f.addressee_id as string)
  const peopleIds = [...new Set([
    ...((participants.data ?? []) as { user_id: string }[]).map(p => p.user_id),
    ...active.map(x => x.s.host_id),
    ...friendIds,
  ])]
  const { data: people } = peopleIds.length
    ? await admin.from('profiles').select('id, display_name, avatar_url').in('id', peopleIds)
    : { data: [] }
  const person = new Map((people ?? []).map(p => [p.id as string, { id: p.id as string, name: (p.display_name as string) ?? '', avatar: (p.avatar_url as string | null) ?? null }]))
  const roomMap = new Map(((roomInfo.data ?? []) as { id: string; name: string; emoji: string | null; invite_code: string | null }[]).map(r => [r.id, r]))
  const partsBySession = new Map<string, string[]>()
  for (const p of (participants.data ?? []) as { session_id: string; user_id: string }[]) {
    partsBySession.set(p.session_id, [...(partsBySession.get(p.session_id) ?? []), p.user_id])
  }

  const sessions = active.map(({ s, start }) => {
    const members = partsBySession.get(s.id) ?? []
    const status: Status = s.host_id === userId ? 'host'
      : members.includes(userId) ? 'going'
      : inviteStatus.get(s.id) ?? 'open'
    const room = s.room_id ? roomMap.get(s.room_id) : undefined
    const canSeeRoom = status === 'host' || status === 'going' || status === 'invited'
      || (s.room_id ? roomIds.includes(s.room_id) || publicRooms.some(r => r.id === s.room_id) : false)
    return {
      id: s.id,
      title: s.title,
      startAt: start,
      durationMins: s.duration_mins,
      repeatDays: s.repeat_days ?? [],
      host: person.get(s.host_id) ?? { id: s.host_id, name: '', avatar: null },
      members: members.map(id => person.get(id) ?? { id, name: '', avatar: null }),
      status,
      roomId: canSeeRoom ? s.room_id : null,
      roomName: room ? `${room.emoji ?? ''} ${room.name}`.trim() : null,
      inviteCode: (status === 'host' || status === 'going') ? room?.invite_code ?? null : null,
    }
  })

  return NextResponse.json({
    sessions,
    friends: friendIds.map(id => person.get(id)).filter(Boolean),
    rooms: [
      ...publicRooms.map(r => ({ id: r.id, name: `${r.emoji ?? ''} ${r.name}`.trim() })),
      ...rooms.filter(r => r.created_by === userId).map(r => ({ id: r.id, name: `${r.emoji ?? ''} ${r.name}（友達部屋）`.trim() })),
    ],
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const ctx = await me()
  if (!ctx) return bad('Unauthorized', 401)
  if (ctx.banned) return bad('Forbidden', 403)
  const { admin, userId, name } = ctx
  const body = await readBody(request)
  const now = Date.now()

  const title = String(body.title ?? '').trim().replace(/\s+/g, ' ')
  if (!title || title.length > MAX_TITLE) return bad(`タイトルは1〜${MAX_TITLE}文字で入力してください`)
  if (hasNgWord(title)) return bad('不適切な言葉が含まれています')
  const duration = Number(body.durationMins)
  if (!Number.isInteger(duration) || duration < MIN_DURATION || duration > MAX_DURATION) return bad(`時間は${MIN_DURATION}〜${MAX_DURATION}分で選んでください`)
  const repeatDays = parseRepeatDays(body.repeatDays)
  if (repeatDays === null) return bad('曜日の指定が正しくありません')
  const time = String(body.time ?? '')

  let start: number | null
  if (repeatDays.length > 0) {
    start = firstWeeklyStart(time, repeatDays, now)
  } else {
    start = jstToUtc(String(body.date ?? ''), time)
    if (start !== null && start < now - 5 * 60_000) return bad('過去の日時は選べません')
  }
  if (start === null) return bad('日時が正しくありません')
  if (start > now + MAX_AHEAD_MS) return bad('90日以内の日時を選んでください')

  // 主催中の勉強会の数を制限
  const { data: mine } = await admin.from('scheduled_sessions').select('scheduled_at, duration_mins, repeat_days').eq('host_id', userId).limit(100)
  const activeCount = (mine ?? []).filter(s => nextOccurrence(s.scheduled_at, s.repeat_days, s.duration_mins, now) !== null).length
  const plan = await getPlan(admin, userId)
  const limit = LIMITS[plan].hostedGroups
  if (activeCount >= limit) {
    return NextResponse.json({
      error: plan === 'free'
        ? `無料プランで主催できる勉強会は${limit}個までです。プレミアムなら${LIMITS.premium.hostedGroups}個まで開けます`
        : `主催できる勉強会は${limit}個までです`,
      upgrade: plan === 'free',
    }, { status: 403 })
  }

  // 集まる部屋：みんなの部屋（Room 1〜3）か、自分が作った友達部屋。新しい部屋は作らない
  const roomId = typeof body.roomId === 'string' && body.roomId ? body.roomId : MAIN_ROOM_IDS[0]
  if (!UUID_RE.test(roomId)) return bad('部屋の指定が正しくありません')
  const { data: room } = await admin.from('rooms').select('*').eq('id', roomId).maybeSingle()
  const okRoom = room && !room.is_archived && (!room.is_private || room.created_by === userId)
  if (!okRoom) return bad('この部屋では勉強会を開けません', 403)

  const { data: session, error } = await admin.from('scheduled_sessions').insert({
    host_id: userId, room_id: roomId, title, scheduled_at: new Date(start).toISOString(),
    duration_mins: duration, repeat_days: repeatDays,
  }).select(SESSION_COLS).single()
  if (error || !session) {
    console.error('study-group create error:', error)
    return bad('勉強会を作れませんでした（データベースの更新が必要かもしれません）', 500)
  }
  await admin.from('session_participants').upsert({ session_id: session.id, user_id: userId }, { onConflict: 'session_id,user_id' })

  const friends = await filterInvitableFriends(admin, userId, body.friendIds)
  const invited = await inviteToSession(admin, session as SessionRow, { id: userId, name }, friends, start)
  return NextResponse.json({ id: session.id, roomId, startAt: start, invited })
}

export async function PATCH(request: Request) {
  const ctx = await me()
  if (!ctx) return bad('Unauthorized', 401)
  if (ctx.banned) return bad('Forbidden', 403)
  const { admin, userId, name } = ctx
  const body = await readBody(request)
  const sessionId = body.sessionId
  if (typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) return bad('invalid request')

  const { data: session } = await admin.from('scheduled_sessions').select(SESSION_COLS).eq('id', sessionId).maybeSingle()
  if (!session) return bad('この勉強会は見つかりませんでした', 404)
  const s = session as SessionRow
  const start = nextOccurrence(s.scheduled_at, s.repeat_days, s.duration_mins)
  if (start === null) return bad('この勉強会は終了しました', 410)

  const [{ data: invite }, { data: part }, { data: access }] = await Promise.all([
    admin.from('session_invites').select('status').eq('session_id', s.id).eq('user_id', userId).maybeSingle(),
    admin.from('session_participants').select('id').eq('session_id', s.id).eq('user_id', userId).maybeSingle(),
    s.room_id ? admin.from('room_access').select('room_id').eq('room_id', s.room_id).eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const isHost = s.host_id === userId

  switch (body.action) {
    case 'join': {
      if (!isHost && !invite && !access) return bad('この勉強会には招待されていません', 403)
      if (s.room_id) await grantRoomAccess(admin, s.room_id, userId)
      const { error } = await admin.from('session_participants').upsert({ session_id: s.id, user_id: userId }, { onConflict: 'session_id,user_id' })
      if (error) return bad('参加できませんでした', 500)
      await admin.from('session_invites').delete().eq('session_id', s.id).eq('user_id', userId)
      if (!isHost && !part) {
        await pushToUsers(admin, [s.host_id], {
          title: '🙌 勉強会に参加者が増えました',
          body: `${name}さんが「${s.title}」に参加します`,
          url: '/lobby#study-groups',
          tag: `join-${s.id}`.slice(0, 64),
        })
      }
      return NextResponse.json({ ok: true })
    }
    case 'decline': {
      if (isHost) return bad('主催者は辞退できません。削除してください')
      if (!invite && !part) return bad('この勉強会には招待されていません', 403)
      await admin.from('session_participants').delete().eq('session_id', s.id).eq('user_id', userId)
      await admin.from('session_invites').upsert(
        { session_id: s.id, user_id: userId, invited_by: s.host_id, status: 'declined' }, { onConflict: 'session_id,user_id' })
      return NextResponse.json({ ok: true })
    }
    case 'leave': {
      if (isHost) return bad('主催者は抜けられません。削除してください')
      await admin.from('session_participants').delete().eq('session_id', s.id).eq('user_id', userId)
      return NextResponse.json({ ok: true })
    }
    case 'invite': {
      if (!isHost && !part) return bad('参加している勉強会だけ招待できます', 403)
      const friends = await filterInvitableFriends(admin, userId, body.friendIds)
      if (friends.length === 0) return bad('招待できるフレンドを選んでください')
      const invited = await inviteToSession(admin, s, { id: userId, name }, friends, start)
      return NextResponse.json({ ok: true, invited })
    }
    default:
      return bad('invalid action')
  }
}

export async function DELETE(request: Request) {
  const ctx = await me()
  if (!ctx) return bad('Unauthorized', 401)
  const { admin, userId } = ctx
  const body = await readBody(request)
  const sessionId = body.sessionId
  if (typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) return bad('invalid request')
  const { data: session } = await admin.from('scheduled_sessions').select('id, host_id').eq('id', sessionId).maybeSingle()
  if (!session || session.host_id !== userId) return bad('この勉強会は削除できません', 403)
  const { error } = await admin.from('scheduled_sessions').delete().eq('id', session.id)
  if (error) return bad('削除できませんでした', 500)
  return NextResponse.json({ ok: true })
}
