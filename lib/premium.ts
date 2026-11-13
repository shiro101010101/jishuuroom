// lib/premium.ts — プレミアムプラン（サーバー専用）。課金状態は subscriptions テーブル（service_role だけ）にある
// 入室・カメラ・記録・ランキング・ピン・マッチ・勉強会への参加は無料のまま（人が集まることが価値なので）
import type { SupabaseClient } from '@supabase/supabase-js'

export type Plan = 'free' | 'premium'

/** プランごとの上限 */
export const LIMITS = {
  free:    { hostedGroups: 2,  secretPins: 3 },
  premium: { hostedGroups: 10, secretPins: 100 },
} as const

/** 表示用の価格（実際の請求額は Stripe の Price で決まる。変えるときは両方そろえる） */
export const PRICES = {
  monthly: { yen: 480, label: '月額 480円' },
  yearly:  { yen: 3800, label: '年額 3,800円（約34%お得）' },
} as const

const ACTIVE = new Set(['active', 'trialing', 'past_due'])

/** そのユーザーのプラン。テーブルが無い・読めないときは free（課金していない人を有料扱いにしない） */
export async function getPlan(admin: SupabaseClient, userId: string): Promise<Plan> {
  const { data, error } = await admin.from('subscriptions')
    .select('status, current_period_end').eq('user_id', userId).maybeSingle()
  if (error || !data) return 'free'
  const end = data.current_period_end ? new Date(data.current_period_end).getTime() : 0
  return ACTIVE.has(data.status) && end > Date.now() ? 'premium' : 'free'
}

/** 複数人のうちプレミアムの人（バッジ表示用） */
export async function premiumUserIds(admin: SupabaseClient, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  const { data, error } = await admin.from('subscriptions')
    .select('user_id, status, current_period_end').in('user_id', userIds.slice(0, 500))
  if (error || !data) return new Set()
  const now = Date.now()
  return new Set(data.filter(d => ACTIVE.has(d.status) && d.current_period_end && new Date(d.current_period_end).getTime() > now).map(d => d.user_id as string))
}
