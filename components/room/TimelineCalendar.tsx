'use client'
// components/room/TimelineCalendar.tsx
import { useState, useRef, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Task } from '@/lib/supabase/types'
import styles from './TimelineCalendar.module.css'

type ScheduledSession = {
  id: string
  title: string
  scheduled_at: string
  duration_mins: number
  subject: string | null
  host_id: string
  profiles?: { display_name: string }
}

type PlacedTask = {
  taskId: string
  title: string
  date: string       // YYYY-MM-DD
  hour: number       // 0-23
  minute: number     // 0 or 30
}

type Props = {
  userId: string
  roomId: string
  tasks: Task[]
  scheduledSessions: ScheduledSession[]
  onJoinSession: (session: ScheduledSession) => void
}

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6) // 6:00 - 23:00
const DAYS_JP = ['日', '月', '火', '水', '木', '金', '土']
const HOUR_HEIGHT = 48 // px per hour

function getWeekDates(offset: number): Date[] {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - dayOfWeek + 1 + offset * 7)
  monday.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function fmt(date: Date) {
  return date.toISOString().split('T')[0]
}

export default function TimelineCalendar({ userId, roomId, tasks, scheduledSessions, onJoinSession }: Props) {
  const supabase = createClient()
  const [weekOffset, setWeekOffset] = useState(0)
  const [placedTasks, setPlacedTasks] = useState<PlacedTask[]>([])
  const [draggingTask, setDraggingTask] = useState<Task | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [now, setNow] = useState(new Date())
  const scrollRef = useRef<HTMLDivElement>(null)

  // Clock update
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Load placed tasks from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`placedTasks:${userId}`)
      if (saved) setPlacedTasks(JSON.parse(saved))
    } catch {}
  }, [userId])

  // Save placed tasks
  const savePlaced = useCallback((tasks: PlacedTask[]) => {
    localStorage.setItem(`placedTasks:${userId}`, JSON.stringify(tasks))
    setPlacedTasks(tasks)
  }, [userId])

  // Scroll to current time on mount
  useEffect(() => {
    if (scrollRef.current) {
      const hour = now.getHours() - 6
      scrollRef.current.scrollTop = Math.max(0, hour * HOUR_HEIGHT - 80)
    }
  }, [])

  const dates = getWeekDates(weekOffset)
  const todayStr = fmt(new Date())

  // Unplaced tasks
  const placedIds = new Set(placedTasks.map(p => p.taskId))
  const unplacedTasks = tasks.filter(t => !placedIds.has(t.id))

  // Sessions by date
  const sessionsByDate: Record<string, ScheduledSession[]> = {}
  scheduledSessions.forEach(s => {
    const d = s.scheduled_at.split('T')[0]
    if (!sessionsByDate[d]) sessionsByDate[d] = []
    sessionsByDate[d].push(s)
  })

  // Placed tasks by date
  const placedByDate: Record<string, PlacedTask[]> = {}
  placedTasks.forEach(p => {
    if (!placedByDate[p.date]) placedByDate[p.date] = []
    placedByDate[p.date].push(p)
  })

  function handleDragStart(task: Task) {
    setDraggingTask(task)
  }

  function handleDragOver(e: React.DragEvent, dateStr: string) {
    e.preventDefault()
    setDragOverCol(dateStr)
  }

  function handleDrop(e: React.DragEvent, dateStr: string, colEl: HTMLDivElement | null) {
    e.preventDefault()
    setDragOverCol(null)
    if (!draggingTask || !colEl) return

    const rect = colEl.getBoundingClientRect()
    const scrollTop = scrollRef.current?.scrollTop ?? 0
    const y = e.clientY - rect.top + scrollTop
    const hourFloat = y / HOUR_HEIGHT + 6
    const hour = Math.max(6, Math.min(22, Math.floor(hourFloat)))
    const minute = hourFloat % 1 >= 0.5 ? 30 : 0

    const newPlaced: PlacedTask = {
      taskId: draggingTask.id,
      title: draggingTask.title,
      date: dateStr,
      hour,
      minute,
    }

    savePlaced([...placedTasks.filter(p => p.taskId !== draggingTask.id), newPlaced])
    setDraggingTask(null)
  }

  function removePlacedTask(taskId: string) {
    savePlaced(placedTasks.filter(p => p.taskId !== taskId))
  }

  function getSessionStatus(session: ScheduledSession) {
    const start = new Date(session.scheduled_at)
    const end = new Date(start.getTime() + session.duration_mins * 60_000)
    const nowMs = now.getTime()
    if (nowMs >= start.getTime() && nowMs < end.getTime()) return 'active'
    if (start.getTime() - nowMs < 10 * 60_000 && start.getTime() > nowMs) return 'soon'
    if (nowMs >= end.getTime()) return 'past'
    return 'upcoming'
  }

  const colRefs = useRef<Record<string, HTMLDivElement | null>>({})

  return (
    <div className={styles.wrap}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.title}>
          📅 {dates[0].getMonth() + 1}/{dates[0].getDate()} — {dates[6].getMonth() + 1}/{dates[6].getDate()}
        </div>
        <div className={styles.nav}>
          <button onClick={() => setWeekOffset(w => w - 1)}>‹</button>
          <button onClick={() => setWeekOffset(0)}>今週</button>
          <button onClick={() => setWeekOffset(w => w + 1)}>›</button>
        </div>
      </div>

      {/* Day labels */}
      <div className={styles.dayLabels}>
        <div className={styles.timeGutter} />
        {dates.map((d, i) => {
          const isToday = fmt(d) === todayStr
          return (
            <div key={i} className={`${styles.dayLabel} ${isToday ? styles.dayLabelToday : ''}`}>
              <span className={styles.dayName}>{DAYS_JP[d.getDay()]}</span>
              <span className={styles.dayNum}>{d.getDate()}</span>
            </div>
          )
        })}
      </div>

      {/* Timeline grid */}
      <div className={styles.timelineScroll} ref={scrollRef}>
        <div className={styles.timelineGrid}>

          {/* Time gutter */}
          <div className={styles.timeGutter}>
            {HOURS.map(h => (
              <div key={h} className={styles.timeLabel} style={{ height: HOUR_HEIGHT }}>
                {h}:00
              </div>
            ))}
          </div>

          {/* Day columns */}
          {dates.map((date, di) => {
            const dateStr = fmt(date)
            const isToday = dateStr === todayStr
            const daySessions = sessionsByDate[dateStr] || []
            const dayPlaced = placedByDate[dateStr] || []
            const isDragOver = dragOverCol === dateStr

            return (
              <div
                key={di}
                className={`${styles.dayCol} ${isDragOver ? styles.dayColDragOver : ''}`}
                style={{ minHeight: HOURS.length * HOUR_HEIGHT }}
                ref={el => { colRefs.current[dateStr] = el }}
                onDragOver={e => handleDragOver(e, dateStr)}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={e => handleDrop(e, dateStr, colRefs.current[dateStr])}
              >
                {/* Hour lines */}
                {HOURS.map((_, hi) => (
                  <div key={hi}>
                    <div className={styles.hourLine} style={{ top: hi * HOUR_HEIGHT }} />
                    <div className={styles.halfLine} style={{ top: hi * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
                  </div>
                ))}

                {/* Scheduled sessions */}
                {daySessions.map(s => {
                  const start = new Date(s.scheduled_at)
                  const top = (start.getHours() - 6 + start.getMinutes() / 60) * HOUR_HEIGHT
                  const height = (s.duration_mins / 60) * HOUR_HEIGHT - 2
                  const status = getSessionStatus(s)
                  return (
                    <div
                      key={s.id}
                      className={`${styles.block} ${styles.blockSession} ${status === 'active' ? styles.blockActive : ''} ${status === 'past' ? styles.blockPast : ''}`}
                      style={{ top, height }}
                      onClick={() => status !== 'past' && onJoinSession(s)}
                    >
                      <div className={styles.blockTitle}>{s.title}</div>
                      <div className={styles.blockMeta}>
                        {start.getHours()}:{String(start.getMinutes()).padStart(2, '0')} · {s.duration_mins}分
                        {status === 'active' && <span className={styles.activeDot}>● 進行中</span>}
                        {status === 'soon' && <span className={styles.soonDot}>⏰ まもなく</span>}
                      </div>
                    </div>
                  )
                })}

                {/* Placed tasks */}
                {dayPlaced.map(p => {
                  const top = (p.hour - 6 + p.minute / 60) * HOUR_HEIGHT
                  return (
                    <div
                      key={p.taskId}
                      className={`${styles.block} ${styles.blockTask}`}
                      style={{ top, height: HOUR_HEIGHT * 0.85 }}
                    >
                      <div className={styles.blockTitle}>✅ {p.title}</div>
                      <button
                        className={styles.removeBtn}
                        onClick={() => removePlacedTask(p.taskId)}
                      >✕</button>
                    </div>
                  )
                })}

                {/* Current time line */}
                {isToday && weekOffset === 0 && (() => {
                  const mins = (now.getHours() - 6) * 60 + now.getMinutes()
                  if (mins < 0 || mins > HOURS.length * 60) return null
                  const top = (mins / 60) * HOUR_HEIGHT
                  return (
                    <div className={styles.nowLine} style={{ top }}>
                      <div className={styles.nowDot} />
                    </div>
                  )
                })()}

                {/* Drop hint overlay */}
                {isDragOver && (
                  <div className={styles.dropHint}>
                    ここにドロップ
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Unplaced tasks panel */}
      <div className={styles.todoPanel}>
        <div className={styles.todoPanelTitle}>
          未割り当てタスク
          <span style={{ fontWeight: 400, color: 'var(--muted)' }}>（時間軸へドラッグ）</span>
        </div>
        {unplacedTasks.length === 0 ? (
          <div className={styles.allDone}>全てのタスクが割り当て済みです ✅</div>
        ) : (
          <div className={styles.chipList}>
            {unplacedTasks.map(task => (
              <div
                key={task.id}
                className={styles.chip}
                draggable
                onDragStart={() => handleDragStart(task)}
                onDragEnd={() => setDraggingTask(null)}
              >
                <span className={styles.chipHandle}>⠿</span>
                {task.title}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <div className={styles.legendDot} style={{ background: 'rgba(167,139,250,.5)' }} />
          予約セッション
        </div>
        <div className={styles.legendItem}>
          <div className={styles.legendDot} style={{ background: 'rgba(52,211,153,.45)' }} />
          タスク
        </div>
        <div className={styles.legendItem}>
          <div className={styles.legendBar} />
          現在時刻
        </div>
      </div>
    </div>
  )
}
