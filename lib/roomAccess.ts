// lib/roomAccess.ts — プライベートルームの入室権（サーバー専用）
import type { SupabaseClient } from '@supabase/supabase-js'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const INVITE_CODE_RE = /^[A-Za-z0-9]{4,32}$/
export const MAX_OWNED_PRIVATE_ROOMS = 10

export function makeInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 見間違えやすい 0/O・1/I を除外
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return Array.from(bytes, b => chars[b % chars.length]).join('')
}

type RoomRow = { id: string; name: string; emoji: string | null; is_private: boolean | null; invite_code: string | null; created_by: string | null }

/** このユーザーがルームに入れるか（公開ルーム・作成者・入室権あり）。DB の can_access_room と同じ条件 */
export async function canEnterRoom(admin: SupabaseClient, room: RoomRow, userId: string) {
  if (!room.is_private || room.created_by === userId) return true
  const { data: access } = await admin.from('room_access')
    .select('room_id').eq('room_id', room.id).eq('user_id', userId).maybeSingle()
  return !!access
}

export async function grantRoomAccess(admin: SupabaseClient, roomId: string, userId: string) {
  await admin.from('room_access').upsert({ room_id: roomId, user_id: userId }, { onConflict: 'room_id,user_id', ignoreDuplicates: true })
}

/** 自分が作った or 入室権があるプライベートルーム */
export async function getMyPrivateRooms(admin: SupabaseClient, userId: string) {
  const { data: access } = await admin.from('room_access').select('room_id').eq('user_id', userId)
  const accessIds = (access ?? []).map((a: { room_id: string }) => a.room_id)
  let q = admin.from('rooms').select('id, name, description, emoji, category, is_private, invite_code, max_members, created_by, created_at')
    .eq('is_private', true)
  q = accessIds.length > 0
    ? q.or(`created_by.eq.${userId},id.in.(${accessIds.join(',')})`)
    : q.eq('created_by', userId)
  const { data } = await q.order('created_at', { ascending: false }).limit(30)
  // 招待コードは作成者以外にも見せてよい（招待された人も友達を呼べるように）
  return data ?? []
}

/** みんなの部屋（Room 1〜3）。勉強会の集合場所にもなる */
export const MAIN_ROOM_IDS = [
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
] as const

export type PublicRoom = { id: string; name: string; description: string | null; emoji: string | null }

/**
 * 公開ルームの一覧（しまった部屋は除く）。migration_rooms_pins.sql をまだ実行していない DB でも動くように、
 * is_archived 列が無ければ全部の公開ルームを返す
 */
export async function listPublicRooms(admin: SupabaseClient): Promise<PublicRoom[]> {
  const res = await admin.from('rooms').select('id, name, description, emoji, is_archived').eq('is_private', false).order('name')
  if (!res.error) return (res.data ?? []).filter((r: { is_archived?: boolean }) => !r.is_archived) as PublicRoom[]
  const { data } = await admin.from('rooms').select('id, name, description, emoji').eq('is_private', false).order('name')
  return (data ?? []) as PublicRoom[]
}
