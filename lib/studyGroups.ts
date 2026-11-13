// lib/studyGroups.ts — 勉強会（予約セッション）の日時計算。サーバー・ブラウザ両方から使う
// 時刻はすべて日本時間（JST）で考える。repeat_days は JST の曜日（0=日〜6=土）
export const JST_MS = 9 * 3_600_000
const DAY_MS = 86_400_000
export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const

export const MIN_DURATION = 15
export const MAX_DURATION = 240
export const MAX_TITLE = 40
/** 開始の何分前から「入室できる」表示にするか */
export const ENTER_EARLY_MIN = 10

/** JST の日付（YYYY-MM-DD）と時刻（HH:MM）から UTC のミリ秒。不正なら null */
export function jstToUtc(date: string, time: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const t = /^(\d{2}):(\d{2})$/.exec(time)
  if (!d || !t) return null
  const [y, m, day, h, mi] = [+d[1], +d[2], +d[3], +t[1], +t[2]]
  if (m < 1 || m > 12 || day < 1 || day > 31 || h > 23 || mi > 59) return null
  const ms = Date.UTC(y, m - 1, day, h, mi) - JST_MS
  // 2/31 などの存在しない日付をはじく
  const back = new Date(ms + JST_MS)
  if (back.getUTCDate() !== day || back.getUTCMonth() !== m - 1) return null
  return ms
}

/** 指定時刻（HH:MM）・曜日で、now より後に始まる最初の回（UTC ミリ秒） */
export function firstWeeklyStart(time: string, days: number[], now: number): number | null {
  const t = /^(\d{2}):(\d{2})$/.exec(time)
  if (!t || days.length === 0) return null
  const j = new Date(now + JST_MS)
  for (let off = 0; off <= 7; off++) {
    const start = Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate() + off, +t[1], +t[2]) - JST_MS
    const wd = new Date(start + JST_MS).getUTCDay()
    if (days.includes(wd) && start > now) return start
  }
  return null
}

/**
 * いま開催中か、これから始まる回の開始時刻（UTC ミリ秒）。終わっていて繰り返しもなければ null
 * 繰り返しの勉強会は、scheduled_at と同じ時刻で、repeat_days の曜日に毎週開く
 */
export function nextOccurrence(scheduledAt: string | number, repeatDays: number[] | null | undefined, durationMins: number, now = Date.now()): number | null {
  const base = typeof scheduledAt === 'number' ? scheduledAt : new Date(scheduledAt).getTime()
  if (!Number.isFinite(base)) return null
  const dur = durationMins * 60_000
  if (base + dur > now) return base
  const days = (repeatDays ?? []).filter(d => d >= 0 && d <= 6)
  if (days.length === 0) return null
  const b = new Date(base + JST_MS)
  const timeOfDay = b.getUTCHours() * 3_600_000 + b.getUTCMinutes() * 60_000
  const today = Math.floor((now + JST_MS) / DAY_MS) * DAY_MS // JST のきょう 0:00（JST 表記のミリ秒）
  for (let off = -1; off <= 8; off++) {
    const start = today + off * DAY_MS + timeOfDay - JST_MS
    const wd = new Date(start + JST_MS).getUTCDay()
    if (days.includes(wd) && start > base && start + dur > now) return start
  }
  return null
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 「11/14(金) 20:00」 */
export function formatJst(ms: number) {
  const j = new Date(ms + JST_MS)
  return `${j.getUTCMonth() + 1}/${j.getUTCDate()}(${WEEKDAYS[j.getUTCDay()]}) ${pad(j.getUTCHours())}:${pad(j.getUTCMinutes())}`
}
/** 「20:00」 */
export function formatJstTime(ms: number) {
  const j = new Date(ms + JST_MS)
  return `${pad(j.getUTCHours())}:${pad(j.getUTCMinutes())}`
}
/** 「毎週 月・水・金」／毎日 */
export function formatRepeat(days: number[] | null | undefined) {
  const d = [...new Set(days ?? [])].filter(x => x >= 0 && x <= 6).sort()
  if (d.length === 0) return ''
  if (d.length === 7) return '毎日'
  if (d.join() === '1,2,3,4,5') return '平日'
  if (d.join() === '0,6') return '毎週 土日'
  return '毎週 ' + d.map(x => WEEKDAYS[x]).join('・')
}

/** 送られてきた曜日の配列を検証して並べ替える。不正なら null */
export function parseRepeatDays(v: unknown): number[] | null {
  if (v == null) return []
  if (!Array.isArray(v) || v.length > 7) return null
  const out = new Set<number>()
  for (const x of v) {
    if (!Number.isInteger(x) || x < 0 || x > 6) return null
    out.add(x)
  }
  return [...out].sort()
}
