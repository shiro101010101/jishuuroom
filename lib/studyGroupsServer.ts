// lib/studyGroupsServer.ts — 勉強会のサーバー専用処理（service_role）。クライアントから import しないこと
import type { SupabaseClient } from '@supabase/supabase-js'
import { pushEnabled, sendPush, type PushPayload, type StoredSub } from '@/lib/push'
import { grantRoomAccess, UUID_RE } from '@/lib/roomAccess'
import { formatJst, formatRepeat } from '@/lib/studyGroups'

export const MAX_INVITES_PER_REQUEST = 20
const CONCURRENCY = 10

/** 指定ユーザーの全端末にプッシュ通知を送る（BAN 中の人には送らない）。届いた人数を返す */
export async function pushToUsers(admin: SupabaseClient, userIds: string[], payload: PushPayload): Promise<number> {
  const ids = [...new Set(userIds)].filter(id => UUID_RE.test(id))
  if (ids.length === 0 || !pushEnabled()) return 0
  const { data: banned } = await admin.from('profiles').select('id').in('id', ids).eq('is_banned', true)
  const bannedSet = new Set((banned ?? []).map((b: { id: string }) => b.id))
  const targets = ids.filter(id => !bannedSet.has(id))
  if (targets.length === 0) return 0
  const { data: subs } = await admin.from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth').in('user_id', targets).limit(1000)
  const list = (subs ?? []) as (StoredSub & { id: string; user_id: string })[]
  const gone: string[] = []
  const reached = new Set<string>()
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const batch = list.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map(s => sendPush(s, payload)))
    results.forEach((r, k) => {
      if (r === 'ok') reached.add(batch[k].user_id)
      else if (r === 'gone') gone.push(batch[k].id)
    })
  }
  if (gone.length > 0) await admin.from('push_subscriptions').delete().in('id', gone)
  return reached.size
}

export type SessionRow = {
  id: string; host_id: string; room_id: string | null; title: string
  scheduled_at: string; duration_mins: number; repeat_days: number[] | null
}

/** 承認済みのフレンドのうち、自分をブロックしていない人だけに絞る */
export async function filterInvitableFriends(admin: SupabaseClient, userId: string, friendIds: unknown): Promise<string[]> {
  if (!Array.isArray(friendIds)) return []
  const ids = [...new Set(friendIds.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x) && x !== userId))]
    .slice(0, MAX_INVITES_PER_REQUEST)
  if (ids.length === 0) return []
  const [{ data: friends }, { data: blocks }] = await Promise.all([
    admin.from('friendships').select('addressee_id').eq('requester_id', userId).eq('status', 'accepted').in('addressee_id', ids),
    admin.from('blocks').select('blocker_id').eq('blocked_id', userId).in('blocker_id', ids),
  ])
  const blocked = new Set((blocks ?? []).map((b: { blocker_id: string }) => b.blocker_id))
  return (friends ?? []).map((f: { addressee_id: string }) => f.addressee_id).filter(id => !blocked.has(id))
}

/**
 * フレンドを勉強会に招待する：部屋の入室権を付け、招待を記録し、チャットとプッシュ通知で知らせる
 * すでに参加している人は飛ばす。辞退した人は「招待中」に戻す。招待できた人数を返す
 */
export async function inviteToSession(
  admin: SupabaseClient, session: SessionRow, inviter: { id: string; name: string }, friendIds: string[], startAt: number,
): Promise<number> {
  if (friendIds.length === 0) return 0
  const { data: already } = await admin.from('session_participants').select('user_id')
    .eq('session_id', session.id).in('user_id', friendIds)
  const going = new Set((already ?? []).map((p: { user_id: string }) => p.user_id))
  const targets = friendIds.filter(id => !going.has(id))
  if (targets.length === 0) return 0

  if (session.room_id) {
    for (const id of targets) await grantRoomAccess(admin, session.room_id, id)
  }
  const { error } = await admin.from('session_invites').upsert(
    targets.map(id => ({ session_id: session.id, user_id: id, invited_by: inviter.id, status: 'invited' })),
    { onConflict: 'session_id,user_id' },
  )
  if (error) { console.error('session invite error:', error); return 0 }

  const repeat = formatRepeat(session.repeat_days)
  const when = repeat ? `${repeat} ${formatJst(startAt).split(' ')[1]}〜（次回 ${formatJst(startAt)}）` : formatJst(startAt)
  const content = `📅 勉強会「${session.title}」に招待しました！\n${when}・${session.duration_mins}分\nロビーの「友達との勉強会」から参加できます\n/lobby#study-groups`.slice(0, 500)
  await admin.from('messages').insert(targets.map(id => ({ sender_id: inviter.id, receiver_id: id, content })))
  await pushToUsers(admin, targets, {
    title: `📅 ${inviter.name}さんから勉強会の招待`,
    body: `「${session.title}」${when}`,
    url: '/lobby#study-groups',
    tag: `invite-${session.id}`.slice(0, 64),
  })
  return targets.length
}
