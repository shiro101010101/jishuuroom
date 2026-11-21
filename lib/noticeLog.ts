// lib/noticeLog.ts — 同じ通知を短い間に何度も送らないための記録（notice_log テーブル・サーバー専用）
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * key の通知を今送ってよいか。送ってよいなら記録を更新して true。
 * テーブルが無い・読めないときは false（送りすぎるより、送らないほうを選ぶ）
 */
export async function claimNotice(admin: SupabaseClient, key: string, intervalMs: number): Promise<boolean> {
  const k = key.slice(0, 200)
  const { data, error } = await admin.from('notice_log').select('sent_at').eq('key', k).maybeSingle()
  if (error) return false
  if (data && Date.now() - new Date(data.sent_at).getTime() < intervalMs) return false
  const { error: e2 } = await admin.from('notice_log').upsert({ key: k, sent_at: new Date().toISOString() }, { onConflict: 'key' })
  return !e2
}

/** 2 人の間にブロックがあるか（どちら向きでも） */
export async function isBlockedBetween(admin: SupabaseClient, a: string, b: string): Promise<boolean> {
  const { data } = await admin.from('blocks').select('blocker_id')
    .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`).limit(1)
  return (data ?? []).length > 0
}

/** userId がブロックした／された相手の一覧 */
export async function blockedSet(admin: SupabaseClient, userId: string): Promise<Set<string>> {
  const { data } = await admin.from('blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`)
  return new Set((data ?? []).map((b: { blocker_id: string; blocked_id: string }) => b.blocker_id === userId ? b.blocked_id : b.blocker_id))
}
