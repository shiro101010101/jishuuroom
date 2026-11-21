// app/api/room/invite/route.ts — フレンドを今いる部屋に招待する（チャットで招待リンクを送る）
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { UUID_RE, canEnterRoom, grantRoomAccess } from '@/lib/roomAccess'

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function POST(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return bad('Unauthorized', 401)

  let body: { roomId?: string; friendId?: string } = {}
  try { body = await request.json() } catch {}
  const { roomId, friendId } = body
  if (!roomId || !friendId || !UUID_RE.test(roomId) || !UUID_RE.test(friendId) || friendId === userId) return bad('invalid request')

  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles').select('is_banned').eq('id', userId).maybeSingle()
  if (!me || me.is_banned) return bad('Forbidden', 403)

  // 承認済みのフレンドだけ招待できる
  const { data: friendship } = await admin.from('friendships').select('id')
    .eq('requester_id', userId).eq('addressee_id', friendId).eq('status', 'accepted').maybeSingle()
  if (!friendship) return bad('フレンドだけを招待できます', 403)

  // 相手にブロックされていたら送らない
  const { data: blocked } = await admin.from('blocks').select('blocker_id')
    .eq('blocker_id', friendId).eq('blocked_id', userId).maybeSingle()
  if (blocked) return bad('招待を送れませんでした', 403)

  const { data: room } = await admin.from('rooms')
    .select('id, name, emoji, is_private, invite_code, created_by').eq('id', roomId).maybeSingle()
  if (!room || !(await canEnterRoom(admin, room, userId))) return bad('この部屋には招待できません', 403)

  let link = `/room/${room.id}`
  if (room.is_private) {
    // 部屋を作った人とブロック関係にある人には、入室権を付けない
    if (room.created_by && room.created_by !== friendId) {
      const { data: ownerBlock } = await admin.from('blocks').select('blocker_id')
        .or(`and(blocker_id.eq.${room.created_by},blocked_id.eq.${friendId}),and(blocker_id.eq.${friendId},blocked_id.eq.${room.created_by})`).limit(1)
      if ((ownerBlock ?? []).length > 0) return bad('招待を送れませんでした', 403)
    }
    await grantRoomAccess(admin, room.id, friendId)
    if (room.invite_code) link = `/invite/${room.invite_code}`
  }

  const content = `📚 「${room.emoji ?? ''}${room.name}」で一緒に勉強しよう！\n${link}`.slice(0, 500)
  const { error } = await admin.from('messages').insert({ sender_id: userId, receiver_id: friendId, content })
  if (error) return bad('招待を送れませんでした', 500)
  return NextResponse.json({ ok: true })
}
