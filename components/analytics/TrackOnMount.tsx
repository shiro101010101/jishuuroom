'use client'
// サーバーコンポーネントのページから「表示された」イベントを 1 回だけ送るための小さな部品
import { useEffect, useRef } from 'react'
import { track, type AnalyticsEvent } from '@/lib/analytics'

export default function TrackOnMount({ event, props }: { event: AnalyticsEvent; props?: Record<string, string | number | boolean> }) {
  const sent = useRef(false)
  useEffect(() => {
    if (sent.current) return
    sent.current = true
    track(event, props)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
