// app/api/room/private/route.ts — 友達と勉強する部屋（プライベートルーム）の作成・削除
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasNgWord } from '@/lib/wordFilter'
import { UUID_RE, MAX_OWNED_PRIVATE_ROOMS, makeInviteCode, grantRoomAccess } from '@/lib/roomAccess'

const EMOJIS = ['🤝', '📚', '✏️', '🧠', '🌙', '☕', '🎧', '🔥']
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

// 新しい友達部屋は作らない（部屋は Room 1〜3 にまとめた。友達とは勉強会で集まる）。今ある友達部屋は使える
const CREATE_DISABLED = true

export async function POST(request: Request) {
  if (CREATE_DISABLED) return bad('新しい部屋は作れなくなりました。Room 1〜3 で「友達との勉強会」を開いてください', 410)
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return bad('Unauthorized', 401)

  let body: { name?: unknown; emoji?: unknown } = {}
  try { body = await request.json() } catch {}
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ')
  const emoji = EMOJIS.includes(String(body.emoji)) ? String(body.emoji) : '🤝'
  if (!name || name.length > 30) return bad('部屋の名前は1〜30文字で入力してください')
  if (hasNgWord(name)) return bad('不適切な言葉が含まれています')

  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles').select('display_name, is_banned').eq('id', userId).maybeSingle()
  if (!me || me.is_banned) return bad('Forbidden', 403)

  const { count } = await admin.from('rooms').select('id', { count: 'exact', head: true })
    .eq('is_private', true).eq('created_by', userId)
  if ((count ?? 0) >= MAX_OWNED_PRIVATE_ROOMS) {
    return bad(`作れる部屋は${MAX_OWNED_PRIVATE_ROOMS}個までです。使わない部屋を削除してください`)
  }

  // 招待コードが重複したら作り直す
  for (let i = 0; i < 3; i++) {
    const { data, error } = await admin.from('rooms').insert({
      name, emoji,
      description: `${me.display_name}さんの部屋 · 招待した友達だけが入れます`,
      category: 'general',
      is_private: true,
      invite_code: makeInviteCode(),
      max_members: 20,
      created_by: userId,
    }).select('id, invite_code').single()
    if (data) {
      await grantRoomAccess(admin, data.id, userId)
      return NextResponse.json({ id: data.id, invite_code: data.invite_code })
    }
    if (error?.code !== '23505') break
  }
  return bad('部屋を作れませんでした。時間をおいてもう一度お試しください', 500)
}

export async function DELETE(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return bad('Unauthorized', 401)

  let roomId: string | undefined
  try { roomId = (await request.json()).roomId } catch {}
  if (!roomId || !UUID_RE.test(roomId)) return bad('roomId required')

  const admin = createAdminClient()
  const { data: room } = await admin.from('rooms').select('id, is_private, created_by').eq('id', roomId).maybeSingle()
  if (!room || !room.is_private || room.created_by !== userId) return bad('この部屋は削除できません', 403)

  // 勉強記録（study_sessions）は残し、部屋への参照だけ外す
  await admin.from('study_sessions').update({ room_id: null }).eq('room_id', roomId)
  const { error } = await admin.from('rooms').delete().eq('id', roomId)
  if (error) return bad('削除できませんでした', 500)
  return NextResponse.json({ ok: true })
}

// ── 部屋の管理（作成者だけ）：入れる人の一覧・招待リンクの作り直し・入室権の取り消し ──
async function ownerRoom(roomId: unknown, userId: string) {
  if (typeof roomId !== 'string' || !UUID_RE.test(roomId)) return null
  const admin = createAdminClient()
  const { data: room } = await admin.from('rooms').select('id, is_private, created_by').eq('id', roomId).maybeSingle()
  if (!room || !room.is_private || room.created_by !== userId) return null
  return { admin, room }
}

/** 入れる人の一覧（作成者だけ） */
export async function GET(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return bad('Unauthorized', 401)
  const roomId = new URL(request.url).searchParams.get('roomId')
  const owned = await ownerRoom(roomId, userId)
  if (!owned) return bad('この部屋は管理できません', 403)
  const { data } = await owned.admin.from('room_access')
    .select('user_id, granted_at, profiles!room_access_user_id_fkey(display_name, avatar_url)')
    .eq('room_id', owned.room.id).neq('user_id', userId).order('granted_at', { ascending: false }).limit(100)
  const members = (data ?? []).map((r: any) => ({ id: r.user_id, display_name: r.profiles?.display_name ?? '', avatar_url: r.profiles?.avatar_url ?? null }))
  return NextResponse.json({ members }, { headers: { 'Cache-Control': 'no-store' } })
}

/** 招待リンクを作り直す（古いリンクは使えなくなる）／特定の人の入室権を取り消す */
export async function PATCH(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return bad('Unauthorized', 401)
  let body: { roomId?: unknown; action?: unknown; targetId?: unknown } = {}
  try { body = await request.json() } catch {}
  const owned = await ownerRoom(body.roomId, userId)
  if (!owned) return bad('この部屋は管理できません', 403)
  const { admin, room } = owned

  if (body.action === 'reissue') {
    for (let i = 0; i < 3; i++) {
      const code = makeInviteCode()
      const { error } = await admin.from('rooms').update({ invite_code: code }).eq('id', room.id)
      if (!error) return NextResponse.json({ invite_code: code })
      if (error.code !== '23505') break
    }
    return bad('作り直せませんでした', 500)
  }
  if (body.action === 'revoke') {
    const targetId = body.targetId
    if (typeof targetId !== 'string' || !UUID_RE.test(targetId) || targetId === userId) return bad('invalid request')
    await admin.from('room_access').delete().eq('room_id', room.id).eq('user_id', targetId)
    await admin.from('room_members').delete().eq('room_id', room.id).eq('user_id', targetId)
    return NextResponse.json({ ok: true })
  }
  return bad('invalid action')
}
