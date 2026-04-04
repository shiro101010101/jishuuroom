// hooks/useTimer.ts
'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

export type TimerMode = 'focus' | 'short' | 'long' | 'custom'

export function useTimer(onPomodoroComplete?: () => void) {
  const [mode, setMode] = useState<TimerMode>('focus')
  const [seconds, setSeconds] = useState(25 * 60)
  const [totalSeconds, setTotalSeconds] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const [pomosCompleted, setPomosCompleted] = useState(0)
  const [sessionCount, setSessionCount] = useState(1)
  const [customFocusMins, setCustomFocusMins] = useState(25)
  const [customBreakMins, setCustomBreakMins] = useState(5)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds(s => {
          if (s <= 1) { handleEnd(); return 0 }
          return s - 1
        })
      }, 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running])

  function handleEnd() {
    setRunning(false)
    if (mode === 'focus' || mode === 'custom') {
      setPomosCompleted(p => p + 1)
      setSessionCount(s => s + 1)
      onPomodoroComplete?.()
    }
  }

  const switchMode = useCallback((newMode: TimerMode) => {
    setRunning(false); setMode(newMode)
    const dur = newMode === 'custom' ? customFocusMins * 60
              : newMode === 'focus'  ? 25 * 60
              : newMode === 'short'  ? 5  * 60 : 15 * 60
    setSeconds(dur); setTotalSeconds(dur)
  }, [customFocusMins])

  const applyCustom = useCallback((focusMins: number, breakMins: number) => {
    setCustomFocusMins(focusMins); setCustomBreakMins(breakMins)
    setRunning(false); setMode('custom')
    setSeconds(focusMins * 60); setTotalSeconds(focusMins * 60)
  }, [])

  const toggle = useCallback(() => setRunning(r => !r), [])

  const reset = useCallback(() => {
    setRunning(false)
    const dur = mode === 'custom' ? customFocusMins * 60
              : mode === 'focus'  ? 25 * 60
              : mode === 'short'  ? 5  * 60 : 15 * 60
    setSeconds(dur); setTotalSeconds(dur)
  }, [mode, customFocusMins])

  const progress = totalSeconds > 0 ? 1 - seconds / totalSeconds : 0

  return {
    mode, seconds, totalSeconds, running, progress,
    pomosCompleted, sessionCount, customFocusMins, customBreakMins,
    toggle, reset, switchMode, applyCustom,
  }
}
