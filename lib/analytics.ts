// lib/analytics.ts — プライバシーに配慮したイベント計測（Vercel Web Analytics。Cookie は使わない）
// 送ってよいもの：イベント名（下の一覧のみ）と、短い記号的な値（英数字・_・- の 32 文字以内）・数値・真偽値だけ。
// 名前・メール・ユーザー ID・部屋 ID・招待コード・自由入力の文字列などの個人情報は絶対に送らない。
//
// イベント一覧（{} はプロパティ）
//   lp_view{via}                      トップページ表示（via: direct / referral / invite）
//   login_click{provider}             ログインボタン（provider: google / line）
//   signup_complete{provider}         新規登録完了（サーバー側で送信）
//   first_room_enter                  初めて部屋に入った
//   timer_start                       タイマー開始
//   pomodoro_complete                 ポモドーロ 1 回完了
//   session_end{minutes_bucket}       勉強終了（minutes_bucket: lt5 / 5_15 / 15_30 / 30_60 / 60_120 / ge120）
//   invite_link_copy | invite_link_line | invite_link_native   招待リンクの共有方法
//   invite_landing_view               招待リンクから来た人がトップを見た
//   invite_accept                     招待を受けて部屋に入った
//   sharecard_open{trigger}           記録カードを開いた（trigger: auto / manual など）
//   sharecard_share | sharecard_x | sharecard_save           記録カードの共有方法
//   push_prompt_shown                 通知のお誘いカードを表示
//   push_granted                      通知を許可して購読できた
//   pwa_install                       ホーム画面に追加（appinstalled）
import { track as vercelTrack } from '@vercel/analytics'

export type AnalyticsEvent =
  | 'lp_view' | 'login_click' | 'signup_complete' | 'first_room_enter'
  | 'timer_start' | 'pomodoro_complete' | 'session_end'
  | 'invite_link_copy' | 'invite_link_line' | 'invite_link_native'
  | 'invite_landing_view' | 'invite_accept'
  | 'sharecard_open' | 'sharecard_share' | 'sharecard_x' | 'sharecard_save'
  | 'push_prompt_shown' | 'push_granted' | 'pwa_install'

export type AnalyticsProps = Record<string, string | number | boolean>

const MAX_KEYS = 8
const KEY_RE = /^[a-z][a-z0-9_]{0,31}$/
// 文字列は「選択肢のような短い記号」だけ（日本語・空白・@・/ などを含む自由な文字列は捨てる）
const VALUE_RE = /^[A-Za-z0-9_-]{1,32}$/

/** 個人情報になり得る値を取り除く（許可されない値は黙って捨てる） */
export function sanitizeProps(props?: Record<string, unknown>): AnalyticsProps | undefined {
  if (!props) return undefined
  const out: AnalyticsProps = {}
  let n = 0
  for (const [k, v] of Object.entries(props)) {
    if (n >= MAX_KEYS) break
    if (!KEY_RE.test(k)) continue
    if (typeof v === 'boolean') out[k] = v
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(v * 100) / 100
    else if (typeof v === 'string' && VALUE_RE.test(v) && !/^[0-9a-f]{8}-/i.test(v)) out[k] = v
    else continue
    n++
  }
  return n ? out : undefined
}

/** 勉強時間（分）を大まかな区分にする（正確な時間は送らない） */
export function minutesBucket(minutes: number): string {
  if (minutes < 5) return 'lt5'
  if (minutes < 15) return '5_15'
  if (minutes < 30) return '15_30'
  if (minutes < 60) return '30_60'
  if (minutes < 120) return '60_120'
  return 'ge120'
}

/** ブラウザから計測イベントを送る（失敗しても画面には影響させない） */
export function track(event: AnalyticsEvent, props?: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  try { vercelTrack(event, sanitizeProps(props)) } catch {}
}

/** ページ URL から個人を特定できる部分（招待コード・部屋 ID・紹介コード・クエリ）を伏せる */
export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw)
    const path = u.pathname
      .replace(/^\/invite\/[^/]+/, '/invite/[code]')
      .replace(/^\/room\/[^/]+/, '/room/[id]')
      .replace(/^\/r\/[^/]+/, '/r/[code]')
    return `${u.origin}${path}`
  } catch {
    return raw.split('?')[0]
  }
}
