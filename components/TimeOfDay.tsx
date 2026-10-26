'use client'
// 時間帯（深夜・明け方・昼・夕方）を <html data-time> に入れて、背景の光の色を時刻に合わせて変える
import { useEffect } from 'react'

export function timeOfDay(h: number) {
  return h >= 22 || h < 4 ? 'night' : h < 7 ? 'dawn' : h < 17 ? 'day' : 'dusk'
}

export default function TimeOfDay() {
  useEffect(() => {
    const update = () => { document.documentElement.dataset.time = timeOfDay(new Date().getHours()) }
    update()
    const t = setInterval(update, 5 * 60_000)
    return () => clearInterval(t)
  }, [])
  return null
}
