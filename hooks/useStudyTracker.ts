// hooks/useStudyTracker.ts — 集中中だけサーバーにハートビートを送り、勉強時間を記録する
'use client'
import { useCallback, useEffect, useRef } from 'react'
import type { MyStats } from '@/lib/studyTime'

const TICK_MS = 60_000

function send(phase: string, roomId: string, beacon = false, pomodoro = false): Promise<{ stats?: MyStats } | null> {
  const body = JSON.stringify({ phase, roomId, pomodoro })
  if (beacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon('/api/study/heartbeat', body)
    return Promise.resolve(null)
  }
  return fetch('/api/study/heartbeat', { method: 'POST', body, keepalive: true })
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null)
}

/**
 * active が true の間（タイマー集中中・離席していない）だけ計測する。
 * onStats はサーバーの集計値（今日の合計・連続日数など）が返るたびに呼ばれる。
 */
export function useStudyTracker(roomId: string, active: boolean, onStats: (s: MyStats) => void) {
  const activeRef = useRef(false)
  const pomodoroRef = useRef(false)
  const onStatsRef = useRef(onStats)
  onStatsRef.current = onStats

  const handle = (res: { stats?: MyStats } | null) => { if (res?.stats) onStatsRef.current(res.stats) }

  useEffect(() => {
    if (!active) {
      if (activeRef.current) {
        activeRef.current = false
        const pomo = pomodoroRef.current
        pomodoroRef.current = false
        send('stop', roomId, false, pomo).then(handle)
      }
      return
    }
    activeRef.current = true
    send('start', roomId).then(handle)
    const t = setInterval(() => send('tick', roomId), TICK_MS)
    return () => clearInterval(t)
  }, [active, roomId])

  // タブを閉じる・ルームを離れるときは残り時間を加算して終了
  useEffect(() => {
    const onUnload = () => { if (activeRef.current) send('stop', roomId, true) }
    window.addEventListener('pagehide', onUnload)
    return () => {
      window.removeEventListener('pagehide', onUnload)
      if (activeRef.current) { activeRef.current = false; send('stop', roomId) }
    }
  }, [roomId])

  /** ポモドーロ完了時に呼ぶ。直後の停止リクエストで完了数を1増やす（二重加算を防ぐため別送しない） */
  const markPomodoro = useCallback(() => { pomodoroRef.current = true }, [])

  return { markPomodoro }
}
