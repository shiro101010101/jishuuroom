// lib/studyTime.ts — 勉強時間の集計（サーバー専用）
import type { SupabaseClient } from '@supabase/supabase-js'

// ランキングの日付の区切り。全ユーザー共通にするため固定（JST）
export const RANKING_TZ_OFFSET_MIN = 9 * 60

// 1回のハートビートで加算する最大秒数（通信の遅れを許容しつつ水増しを防ぐ）
export const MAX_CREDIT_SEC = 75
// これ以上ハートビートが途切れたらセッション終了とみなす
export const SESSION_GAP_SEC = 120

export type Period = 'day' | 'week' | 'month'

const DAY_MS = 86_400_000
const offsetMs = RANKING_TZ_OFFSET_MIN * 60_000

/** ランキング用タイムゾーンでの「日付番号」（エポックからの日数） */
export function dayIndex(date: Date) {
  return Math.floor((date.getTime() + offsetMs) / DAY_MS)
}

/** 期間の開始時刻（UTC の Date） */
export function periodStart(period: Period, now = new Date()): Date {
  const local = new Date(now.getTime() + offsetMs)
  const y = local.getUTCFullYear(), m = local.getUTCMonth(), d = local.getUTCDate()
  let startLocal: number
  if (period === 'day') startLocal = Date.UTC(y, m, d)
  else if (period === 'week') {
    const dow = (local.getUTCDay() + 6) % 7 // 月曜始まり
    startLocal = Date.UTC(y, m, d - dow)
  } else startLocal = Date.UTC(y, m, 1)
  return new Date(startLocal - offsetMs)
}

/** 連続日数：今日または昨日まで、1日でも勉強した日が続いている日数 */
export function computeStreak(dayIndexes: Set<number>, now = new Date()) {
  let cur = dayIndex(now)
  if (!dayIndexes.has(cur)) cur -= 1
  let streak = 0
  while (dayIndexes.has(cur)) { streak++; cur-- }
  return streak
}

export type MyStats = {
  todaySeconds: number
  pomosToday: number
  streak: number
  week: { day_of_week: number; total_seconds: number }[] // 0=日曜（既存 UI に合わせる）
}

/** 自分の統計（今日 / 直近7日 / 連続日数） */
export async function getMyStats(admin: SupabaseClient, userId: string): Promise<MyStats> {
  const now = new Date()
  const since = new Date(periodStart('day', now).getTime() - 365 * DAY_MS)
  const { data } = await admin
    .from('study_sessions')
    .select('started_at, duration_seconds, pomodoros_completed')
    .eq('user_id', userId)
    .gte('started_at', since.toISOString())
    .gt('duration_seconds', 0)

  const today = dayIndex(now)
  const days = new Set<number>()
  const weekMap: Record<number, number> = {}
  let todaySeconds = 0, pomosToday = 0
  for (const s of data ?? []) {
    const started = new Date(s.started_at)
    const di = dayIndex(started)
    days.add(di)
    if (di === today) { todaySeconds += s.duration_seconds ?? 0; pomosToday += s.pomodoros_completed ?? 0 }
    if (today - di < 7) {
      const dow = new Date(started.getTime() + offsetMs).getUTCDay()
      weekMap[dow] = (weekMap[dow] ?? 0) + (s.duration_seconds ?? 0)
    }
  }
  return {
    todaySeconds, pomosToday,
    streak: computeStreak(days, now),
    week: Object.entries(weekMap).map(([d, t]) => ({ day_of_week: Number(d), total_seconds: t })),
  }
}
