'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { createClient } from '@/lib/supabase/client'
import { useTimer } from '@/hooks/useTimer'
import { useWebRTC } from '@/hooks/useWebRTC'
import { useRoomRealtime, useMessages, useFriends } from '@/hooks/useRealtime'
import { useInteractions } from '@/hooks/useInteractions'
import TaskPanel from './TaskPanel'
import MobileScreens from './MobileScreens'
import { useFaceDetection } from '@/hooks/useFaceDetection'
import SafetyPanel from './SafetyPanel'
import { translations, type Lang } from '@/lib/i18n'
import TimelineCalendar from './TimelineCalendar'
import RankingPanel from './RankingPanel'
import { usePresence } from '@/hooks/usePresence'
import { useStudyTracker } from '@/hooks/useStudyTracker'
import type { MyStats } from '@/lib/studyTime'
import type { Profile, Room, RoomMember, Task, Friendship } from '@/lib/supabase/types'
import styles from './RoomClient.module.css'

type Props = {
  profile: Profile
  room: Room
  allRooms: Room[]
  initialMembers: (RoomMember & { profiles: { display_name: string; avatar_url: string | null } })[]
  initialFriends: (Friendship & { profiles: Profile })[]
  initialTasks: Task[]
  initialStats: MyStats
}

const SUBJECTS = ['数学','英語','国語','理科','社会','物理','化学','生物','歴史','地理','プログラミング','英会話','資格勉強','その他']
const QUOTES = [
  { text: '千里の道も一歩から。', author: '老子' },
  { text: '努力した者が全て報われるとは限らない。しかし、成功した者は皆努力している。', author: '王貞治' },
  { text: '今日の自分が昨日の自分より少し成長していれば、それで十分だ。', author: '宮本武蔵' },
  { text: '天才とは、1%のひらめきと99%の努力である。', author: 'エジソン' },
  { text: 'できるかどうかではなく、やるかどうかだ。', author: '孫正義' },
]
const BGM_TRACKS = [
  { id: 'lofi',   name: 'Lo-fi Hip Hop',    icon: '🎹', type: 'lofi' },
  { id: 'rain',   name: '雨音',              icon: '🌧️', type: 'rain' },
  { id: 'nature', name: '森の環境音',         icon: '🌿', type: 'nature' },
  { id: 'cafe',   name: 'カフェの雑音',       icon: '☕', type: 'cafe' },
  { id: 'piano',  name: 'ピアノ',            icon: '🎵', type: 'piano' },
  { id: 'focus',  name: '集中ホワイトノイズ', icon: '🔊', type: 'white' },
]
const WORD_FILTERS = [
  '死ね', 'バカ', 'アホ', 'きもい', 'うざい', '消えろ', 'クソ', 'ばか', 'あほ', 'ゴミ', 'カス',
  'えっち', 'エッチ', 'セックス', 'チンコ', 'マンコ', 'おっぱい', 'ちんちん', 'おちんちん',
  'ヌード', '裸', 'えろ', 'エロ', '18禁', 'アダルト',
  'キモい', 'デブ', 'ブス', 'キショい',
]
const SEAT_COLORS = ['#6c8aff','#a78bfa','#34d399','#f59e0b','#f87171','#fbbf24','#60a5fa','#fb7185','#4ade80','#facc15']
type PanelId = 'timer' | 'tasks' | 'music' | 'stats' | 'ranking' | 'friends' | 'schedule' | 'rooms' | 'activity' | 'safety'
const DOCK_PANELS: { id: PanelId; icon: string; ja: string; en: string }[] = [
  { id: 'timer',    icon: '⏱', ja: 'タイマー', en: 'Timer' },
  { id: 'tasks',    icon: '✅', ja: 'タスク',   en: 'Tasks' },
  { id: 'music',    icon: '🎵', ja: 'BGM',      en: 'Music' },
  { id: 'stats',    icon: '📊', ja: '統計',     en: 'Stats' },
  { id: 'ranking',  icon: '🏆', ja: 'ランキング', en: 'Ranking' },
  { id: 'friends',  icon: '👥', ja: 'フレンド', en: 'Friends' },
  { id: 'schedule', icon: '📅', ja: '予定',     en: 'Schedule' },
  { id: 'rooms',    icon: '🏠', ja: 'ルーム',   en: 'Rooms' },
  { id: 'activity', icon: '🔔', ja: '通知',     en: 'Activity' },
  { id: 'safety',   icon: '🛡️', ja: '安全設定', en: 'Safety' },
]

export default function RoomClient({ profile, room, allRooms, initialMembers, initialFriends, initialTasks, initialStats }: Props) {
  const router = useRouter()
  const supabase = createClient()

  // ── Core hooks ──
  const timer = useTimer(() => {
    showToast('🍅 ポモドーロ完了！お疲れさまでした')
    addNotif('🍅', 'ポモドーロを完了しました！')
    markPomodoro()
  })
  const [cameraOn, setCameraOn] = useState(false)
  const { localStream, remoteStreams } = useWebRTC(room.id, profile.id, cameraOn)

  // ── Face detection ──
  const faceVideoRef = useRef<HTMLVideoElement | null>(null)
  const [faceDetectEnabled, setFaceDetectEnabled] = useState(false)
  const [noFaceThreshold, setNoFaceThreshold] = useState(120) // 秒
  const { faceStatus, noFaceSeconds } = useFaceDetection(
    faceVideoRef,
    cameraOn && faceDetectEnabled,
    () => {
      showToast(T.faceWarning)
      addNotif('😴', '顔が検出されませんでした')
    },
    noFaceThreshold
  )
  const { members, updateStatus } = useRoomRealtime(room.id, profile.id)
  const rawMembers = members.length > 0 ? members : initialMembers
  const { friends, pendingIn, unreadCounts, blockUser, reportUser, acceptFriendRequest, sendFriendRequest, newFriendRequest, setNewFriendRequest } = useFriends(profile.id)
  const displayFriends = friends.length > 0 ? friends : initialFriends
  const {
    dailyMessages, myMessage, reactions, showPinnedOnly, setShowPinnedOnly,
    mutualPinNotif, pinnedUserIds, REACTION_EMOJIS,
    sendReaction, togglePin, saveDailyMessage, isPinned, getReactionsFor,
  } = useInteractions(profile.id, room.id)

  // ── Stats ──
  const [todaySeconds, setTodaySeconds] = useState(initialStats.todaySeconds)
  const [pomosToday, setPomosToday] = useState(initialStats.pomosToday)
  const [tasksDoneToday, setTasksDoneToday] = useState(0)
  const [streak, setStreak] = useState(initialStats.streak)
  const [weeklyStats, setWeeklyStats] = useState(initialStats.week)
  const [rankRefresh, setRankRefresh] = useState(0)
  const [statView, setStatView] = useState<'week' | 'month'>('week')
  const [monthStats, setMonthStats] = useState<{ day: number; total_seconds: number }[]>([])

  // ── Tasks ──
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [currentTask, setCurrentTask] = useState(initialTasks[0]?.title ?? '今日も頑張ろう！')

  // ── Subject ──
  const [mySubject, setMySubject] = useState<string>(profile.subject ?? '')
  const [showSubjectPicker, setShowSubjectPicker] = useState(false)

  // ── Custom timer modal ──
  const [showCustomTimer, setShowCustomTimer] = useState(false)
  const [customFocusInput, setCustomFocusInput] = useState(25)
  const [customBreakInput, setCustomBreakInput] = useState(5)

  // ── Session scheduler ──
  const [showScheduler, setShowScheduler] = useState(false)
  const [schedTitle, setSchedTitle] = useState('')
  const [schedDate, setSchedDate] = useState('')
  const [schedTime, setSchedTime] = useState('')
  const [schedDuration, setSchedDuration] = useState(60)
  const [scheduledSessions, setScheduledSessions] = useState<{
    id: string; title: string; scheduled_at: string; subject: string | null;
    duration_mins: number; host_id: string;
    profiles?: { display_name: string }
  }[]>([])

  // ── Chat ──
  const [chatFriendId, setChatFriendId] = useState<string | null>(null)
  const { messages: chatMessages, sendMessage } = useMessages(profile.id, chatFriendId ?? '')
  const [chatInput, setChatInput] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  // ── UI ──
  const [panel, setPanel] = useState<PanelId | null>(null)
  const [zen, setZen] = useState(false)
  const [showProfileEdit, setShowProfileEdit] = useState(false)
  const [editName, setEditName] = useState(profile.display_name)
  const [savingName, setSavingName] = useState(false)

  // ── Language ──
  const [lang, setLang] = useState<Lang>('ja')
  useEffect(() => {
    const saved = localStorage.getItem('lang') as Lang
    if (saved === 'ja' || saved === 'en') setLang(saved)
  }, [])
  const T = translations[lang]
  const toggleLang = () => {
    const next: Lang = lang === 'ja' ? 'en' : 'ja'
    setLang(next)
    localStorage.setItem('lang', next)
  }
  const [activeMobScreen, setActiveMobScreen] = useState<'timer' | 'room' | 'friends' | 'stats'>('timer')
  const [notifications, setNotifications] = useState([{ icon: '🏠', text: `「${room.name}」に入室しました`, time: 'たった今' }])
  const [bgmPlaying, setBgmPlaying] = useState<string | null>(null)
  const [volume, setVolume] = useState(0.4)
  const [blockModal, setBlockModal] = useState<{ userId: string; name: string } | null>(null)
  const [reportModal, setReportModal] = useState<{ userId: string; name: string } | null>(null)
  const [reactionTarget, setReactionTarget] = useState<{ userId: string; name: string } | null>(null)
  const [reactionResult, setReactionResult] = useState<string | null>(null)
  const [dailyMsgInput, setDailyMsgInput] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [awayModal, setAwayModal] = useState(false)
  const [awayCountdown, setAwayCountdown] = useState(60)
  const [awayEnabled, setAwayEnabled] = useState(false)
  const [awayMinutes, setAwayMinutes] = useState(5)
  const [currentTime, setCurrentTime] = useState('')
  const [quote, setQuote] = useState(QUOTES[0])
  const [showPinnedFilter, setShowPinnedFilter] = useState(false)

  // ── Refs ──
  const lastActivityRef = useRef(Date.now())
  const awayCountRef = useRef<NodeJS.Timeout | null>(null)
  const bgmCtxRef = useRef<AudioContext | null>(null)
  const bgmGainRef = useRef<GainNode | null>(null)
  const bgmNodesRef = useRef<AudioNode[]>([])

  // ── Effects ──
  useEffect(() => {
    const tick = () => {
      const n = new Date()
      setCurrentTime(String(n.getHours()).padStart(2,'0') + ':' + String(n.getMinutes()).padStart(2,'0'))
    }
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t)
  }, [])
  useEffect(() => { setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]) }, [])
  useEffect(() => {
    const reset = () => { lastActivityRef.current = Date.now(); if (awayModal) dismissAway() }
    const events = ['mousemove','keydown','click','touchstart','scroll']
    events.forEach((e: any) => window.addEventListener(e, reset, { passive: true }))
    return () => events.forEach((e: any) => window.removeEventListener(e, reset))
  }, [awayModal])
  useEffect(() => {
    const t = setInterval(() => {
      if (!timer.running || timer.mode !== 'focus') return
      if (awayEnabled && Date.now() - lastActivityRef.current >= awayMinutes * 60 * 1000 && !awayModal) triggerAway()
    }, 30_000)
    return () => clearInterval(t)
  }, [timer.running, timer.mode, awayModal, awayEnabled, awayMinutes])
  // 勉強時間の記録（サーバー側で計測）と本物のオンライン人数
  const isFocusing = timer.running && (timer.mode === 'focus' || timer.mode === 'custom') && !awayModal
  const { markPomodoro } = useStudyTracker(room.id, isFocusing, (s) => {
    setTodaySeconds(s.todaySeconds); setPomosToday(s.pomosToday); setStreak(s.streak)
    setWeeklyStats(s.week); setRankRefresh(k => k + 1)
  })
  const presence = usePresence(profile.id, room.id, isFocusing)
  // Presence 同期後は、実際に接続している人だけを表示（閉じ忘れの幽霊メンバーを除外）
  const displayMembers = presence.synced
    ? rawMembers.filter((m: any) => presence.roomUserIds.has(m.user_id))
    : rawMembers
  useEffect(() => { updateStatus(timer.mode === 'short' || timer.mode === 'long' ? 'break' : 'studying', currentTask, cameraOn) }, [cameraOn, timer.mode, currentTask])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (zen) setZen(false)
      else if (chatFriendId) setChatFriendId(null)
      else setPanel(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zen, chatFriendId])

  // Live study counter
  useEffect(() => {
    if (!isFocusing) return
    const t = setInterval(() => setTodaySeconds(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [isFocusing])

  // Fetch scheduled sessions
  useEffect(() => {
    fetchSessions()
  }, [room.id])

  // Fetch month stats
  useEffect(() => {
    if (statView === 'month') fetchMonthStats()
  }, [statView])

  async function fetchSessions() {
    const supa = supabase as any
    const { data, error } = await supa.from('scheduled_sessions')
      .select('id, title, scheduled_at, subject, host_id, duration_mins, room_id')
      .eq('host_id', profile.id)
      .gte('scheduled_at', new Date(Date.now() - 24*60*60*1000).toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(20)
    if (error) { console.error('fetchSessions error:', error); return }

    const { data: myParticipations } = await supa.from('session_participants')
      .select('session_id')
      .eq('user_id', profile.id)

    let allData: any[] = data || []
    if (myParticipations && myParticipations.length > 0) {
      const participatedIds = myParticipations.map((p: any) => p.session_id)
      const { data: partSessions } = await supa.from('scheduled_sessions')
        .select('id, title, scheduled_at, subject, host_id, duration_mins, room_id')
        .in('id', participatedIds)
        .gte('scheduled_at', new Date(Date.now() - 24*60*60*1000).toISOString())
        .order('scheduled_at', { ascending: true })
      if (partSessions) {
        const ids = new Set(allData.map((s: any) => s.id))
        partSessions.forEach((s: any) => { if (!ids.has(s.id)) allData.push(s) })
      }
    }
    allData.sort((a: any, b: any) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

    if (allData) {
      const hostIds = Array.from(new Set(allData.map((s: any) => s.host_id)))
      const { data: profiles } = await supa.from('profiles')
        .select('id, display_name')
        .in('id', hostIds)
      const profileMap: Record<string, string> = {}
      profiles?.forEach((p: any) => { profileMap[p.id] = p.display_name })
      setScheduledSessions(allData.map((s: any) => ({
        ...s,
        profiles: { display_name: profileMap[s.host_id] || 'Unknown' }
      })))
    }
  }

  async function fetchMonthStats() {
    const start = new Date(); start.setDate(1); start.setHours(0,0,0,0)
    const { data } = await (supabase as any).from('study_sessions')
      .select('started_at, duration_seconds')
      .eq('user_id', profile.id)
      .gte('started_at', start.toISOString())
    if (data) {
      const byDay: Record<number, number> = {}
      data.forEach((s: any) => {
        const d = new Date(s.started_at).getDate()
        byDay[d] = (byDay[d] || 0) + (s.duration_seconds || 0)
      })
      const days = Array.from({ length: new Date().getDate() }, (_, i) => ({
        day: i + 1, total_seconds: byDay[i + 1] || 0
      }))
      setMonthStats(days)
    }
  }

  function triggerAway() {
    setAwayModal(true); setAwayCountdown(60); updateStatus('away')
    addNotif('⚠️', '席を外していると検出されました')
    let cnt = 60
    awayCountRef.current = setInterval(() => {
      cnt--; setAwayCountdown(cnt)
      if (cnt <= 0) {
        clearInterval(awayCountRef.current!); setAwayModal(false)
        if (timer.running) timer.toggle()
        showToast('⏸ 長時間席を外したためタイマーを停止しました')
      }
    }, 1000)
  }

  function dismissAway() {
    if (awayCountRef.current) clearInterval(awayCountRef.current)
    setAwayModal(false); updateStatus('studying', currentTask, cameraOn)
    lastActivityRef.current = Date.now(); showToast('📚 おかえりなさい！')
  }

  async function saveDisplayName() {
    if (!editName.trim()) return
    setSavingName(true)
    await (supabase as any).from('profiles').update({ display_name: editName.trim() }).eq('id', profile.id)
    profile.display_name = editName.trim()
    setSavingName(false)
    setShowProfileEdit(false)
    showToast(lang==='ja'?'✅ 名前を変更しました':'✅ Name updated!')
  }

  async function addTask(title: string) {
    const { data } = await (supabase as any).from('tasks').insert({ user_id: profile.id, title, is_shared: false, share_scope: 'private' }).select().single()
    if (data) { setTasks(prev => [data, ...prev]); setCurrentTask(data.title) }
  }

  // タスク共有スコープをローカルでも更新
  async function updateTaskShareLocal(taskId: string, scope: 'private' | 'friends' | 'room') {
    await (supabase as any).from('tasks')
      .update({ is_shared: scope !== 'private', share_scope: scope })
      .eq('id', taskId)
      .eq('user_id', profile.id)
    // Update local state immediately
    setTasks(prev => prev.map((t: any) =>
      t.id === taskId ? { ...t, is_shared: scope !== 'private', share_scope: scope } : t
    ))
  }
  async function completeTask(task: Task) {
    await (supabase as any).from('tasks').update({ completed: true, completed_at: new Date().toISOString() }).eq('id', task.id)
    setTasks(prev => prev.filter((t: any) => t.id !== task.id))
    setTasksDoneToday(n => n + 1); addNotif('✅', `「${task.title}」を完了`)
  }
  async function deleteTask(taskId: string) {
    await (supabase as any).from('tasks').delete().eq('id', taskId)
    setTasks(prev => prev.filter((t: any) => t.id !== taskId))
  }
  async function changeSubject(s: string) {
    setMySubject(s); setShowSubjectPicker(false)
    await (supabase as any).rpc('update_subject', { p_subject: s })
    await (supabase as any).from('room_members').update({ current_task: s }).eq('room_id', room.id).eq('user_id', profile.id)
    addNotif('🎯', `科目を「${s}」に設定しました`)
  }
  async function scheduleSession() {
    if (!schedTitle) { showToast('❌ タイトルを入力してください'); return }
    if (!schedDate) { showToast('❌ 日付を選択してください'); return }
    if (!schedTime) { showToast('❌ 時刻を選択してください'); return }
    const dt = new Date(`${schedDate}T${schedTime}`)

    // 専用プライベートルームを自動作成
    const inviteCode = Math.random().toString(36).slice(2, 10).toUpperCase()
    const { data: privateRoom } = await (supabase as any).from('rooms').insert({
      name: schedTitle,
      description: `${profile.display_name}さんのセッション · ${schedDuration}分`,
      emoji: '🔒',
      category: mySubject || 'general',
      is_private: true,
      invite_code: inviteCode,
      created_by: profile.id,
    }).select().single()

    if (!privateRoom) { showToast('❌ ルーム作成に失敗しました'); return }

    // セッションをプライベートルームに紐付け
    const { data: session } = await (supabase as any).from('scheduled_sessions').insert({
      host_id: profile.id,
      room_id: privateRoom.id,
      title: schedTitle,
      subject: mySubject || null,
      scheduled_at: dt.toISOString(),
      duration_mins: schedDuration,
    }).select().single()

    // ホスト自身を参加者に追加
    if (session) {
      await (supabase as any).from('session_participants').insert({
        session_id: session.id, user_id: profile.id
      })
    }

    setShowScheduler(false); setSchedTitle(''); fetchSessions()
    addNotif('📅', `セッション「${schedTitle}」を予約しました`)
    showToast('📅 予約完了！参加者には招待リンクを共有してください')
  }
  async function joinSession(sessionId: string) {
    await (supabase as any).from('session_participants').upsert(
      { session_id: sessionId, user_id: profile.id },
      { onConflict: 'session_id,user_id' }
    )
    fetchSessions()
    showToast('✅ 参加登録しました！開始時刻になると入室できます')
    addNotif('✋', 'セッションに参加登録しました')
  }

  // ── BGM ──
  async function initAudio(): Promise<boolean> {
    try {
      if (!bgmCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        bgmCtxRef.current = new AudioCtx()
        bgmGainRef.current = bgmCtxRef.current.createGain()
        bgmGainRef.current.gain.value = volume
        bgmGainRef.current.connect(bgmCtxRef.current.destination)
      }
      if (bgmCtxRef.current.state === 'suspended') {
        await bgmCtxRef.current.resume()
      }
      return bgmCtxRef.current.state === 'running'
    } catch(e) {
      console.error('Audio init failed:', e)
      return false
    }
  }
  function stopBgmNodes() {
    bgmNodesRef.current.forEach((n: any) => {
      try {
        if (typeof n.stop === 'function') n.stop()
        if (typeof n.disconnect === 'function') n.disconnect()
      } catch {}
    })
    bgmNodesRef.current = []
    // Also suspend context to ensure silence
    if (bgmCtxRef.current && bgmCtxRef.current.state === 'running') {
      bgmCtxRef.current.suspend().catch(() => {})
    }
  }
  function makeNoise(ctx: AudioContext, gainNode: GainNode, type: 'rain'|'nature'|'cafe'|'white') {
    const bufSize = ctx.sampleRate * 3
    const buf = ctx.createBuffer(2, bufSize, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch)
      for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1)
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true
    const flt = ctx.createBiquadFilter()
    if (type === 'rain') { flt.type = 'bandpass'; flt.frequency.value = 400; flt.Q.value = 0.5 }
    else if (type === 'nature') { flt.type = 'lowpass'; flt.frequency.value = 800 }
    else if (type === 'cafe') { flt.type = 'lowpass'; flt.frequency.value = 1200 }
    else { flt.type = 'lowpass'; flt.frequency.value = 3000 }
    const g = ctx.createGain(); g.gain.value = type === 'white' ? 0.15 : 0.25
    src.connect(flt); flt.connect(g); g.connect(gainNode); src.start()
    bgmNodesRef.current.push(src, flt, g)
  }

  function scheduleLofi(ctx: AudioContext, gainNode: GainNode) {
    // Lo-fi chord progression: Cmaj7 - Am7 - Fmaj7 - G7
    const chords = [
      [261.63, 329.63, 392.00, 493.88], // Cmaj7
      [220.00, 261.63, 329.63, 440.00], // Am7
      [174.61, 220.00, 261.63, 349.23], // Fmaj7
      [196.00, 246.94, 293.66, 391.99], // G7
    ]
    const bpm = 75; const beatLen = 60 / bpm
    let time = ctx.currentTime + 0.1
    const loop = () => {
      chords.forEach(chord => {
        chord.forEach((freq, i) => {
          const osc = ctx.createOscillator()
          const g = ctx.createGain()
          osc.type = i === 0 ? 'sawtooth' : 'sine'
          osc.frequency.value = freq * (i === 0 ? 0.5 : 1)
          // Slight detune for warmth
          osc.detune.value = (Math.random() - 0.5) * 8
          g.gain.setValueAtTime(0, time)
          g.gain.linearRampToValueAtTime(0.04, time + 0.05)
          g.gain.exponentialRampToValueAtTime(0.001, time + beatLen * 4 - 0.1)
          osc.connect(g); g.connect(gainNode); osc.start(time); osc.stop(time + beatLen * 4)
        })
        time += beatLen * 4
      })
    }
    loop()
    // Schedule next loop
    const intervalMs = beatLen * 4 * chords.length * 1000
    const timer = setInterval(() => {
      if (!bgmCtxRef.current) { clearInterval(timer); return }
      loop()
    }, intervalMs)
    bgmNodesRef.current.push({ disconnect: () => clearInterval(timer) } as any)
  }

  function schedulePiano(ctx: AudioContext, gainNode: GainNode) {
    const notes = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25]
    const bpm = 60; const beatLen = 60 / bpm
    let time = ctx.currentTime + 0.1
    const playNote = () => {
      const freq = notes[Math.floor(Math.random() * notes.length)]
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq * (Math.random() > 0.5 ? 1 : 2)
      g.gain.setValueAtTime(0, time)
      g.gain.linearRampToValueAtTime(0.06, time + 0.02)
      g.gain.exponentialRampToValueAtTime(0.001, time + beatLen * 2)
      osc.connect(g); g.connect(gainNode); osc.start(time); osc.stop(time + beatLen * 2)
      time += beatLen * (Math.random() > 0.6 ? 1 : 2)
    }
    for (let i = 0; i < 8; i++) playNote()
    const timer = setInterval(() => {
      if (!bgmCtxRef.current) { clearInterval(timer); return }
      const now = ctx.currentTime
      time = now + 0.1
      for (let i = 0; i < 8; i++) playNote()
    }, beatLen * 8 * 1000)
    bgmNodesRef.current.push({ disconnect: () => clearInterval(timer) } as any)
  }

  async function playBgm(id: string) {
    stopBgmNodes()
    const started = await initAudio()
    if (!started) { showToast('🔇 音声を開始できませんでした。もう一度クリックしてください'); return }
    const ctx = bgmCtxRef.current!; const gain = bgmGainRef.current!
    const track = BGM_TRACKS.find((t: any) => t.id === id)!
    const type = (track as any).type

    if (type === 'lofi') {
      scheduleLofi(ctx, gain)
      makeNoise(ctx, gain, 'cafe')
    } else if (type === 'piano') {
      schedulePiano(ctx, gain)
    } else if (type === 'rain') {
      makeNoise(ctx, gain, 'rain')
      // Add subtle thunder-like low rumble
      const lfo = ctx.createOscillator(); const lfoGain = ctx.createGain()
      lfo.frequency.value = 0.1; lfoGain.gain.value = 0.05
      lfo.connect(lfoGain); lfoGain.connect(gain); lfo.start()
      bgmNodesRef.current.push(lfo, lfoGain)
    } else if (type === 'nature') {
      makeNoise(ctx, gain, 'nature')
      // Add chirping birds effect
      const birdInterval = setInterval(() => {
        if (!bgmCtxRef.current) { clearInterval(birdInterval); return }
        const o = ctx.createOscillator(); const g = ctx.createGain()
        o.frequency.value = 2000 + Math.random() * 1000
        o.type = 'sine'
        const t = ctx.currentTime
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.05)
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
        o.connect(g); g.connect(gain); o.start(t); o.stop(t + 0.3)
      }, 800 + Math.random() * 2000)
      bgmNodesRef.current.push({ disconnect: () => clearInterval(birdInterval) } as any)
    } else if (type === 'cafe') {
      makeNoise(ctx, gain, 'cafe')
    } else {
      makeNoise(ctx, gain, 'white')
    }
    setBgmPlaying(id); addNotif('🎵', `BGM「${(track as any).name}」を再生中`)
  }
  function toggleBgm(id: string) { if (bgmPlaying === id) { stopBgmNodes(); setBgmPlaying(null) } else { playBgm(id) } }

  function togglePanel(id: PanelId) { setChatFriendId(null); setPanel(p => p === id ? null : id) }
  function openChat(friendId: string) { setPanel('friends'); setChatFriendId(friendId) }
  async function leaveRoom() {
    await fetch('/api/room/leave', { method: 'POST', body: JSON.stringify({ roomId: room.id }) }).catch(() => {})
    router.push('/')
  }

  function addNotif(icon: string, text: string) { setNotifications(prev => [{ icon, text, time: 'たった今' }, ...prev].slice(0, 10)) }
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000) }
  async function handleBlock(userId: string, name: string) {
    await blockUser(userId); setBlockModal(null)
    addNotif('🚫', `「${name}」をブロックしました`); showToast(`🚫 ${name} をブロックしました`)
  }
  async function handleReport(userId: string, reason: string) {
    await reportUser(userId, reason); setReportModal(null); showToast('📢 報告を送信しました')
  }
  async function handleSendMsg() {
    if (!chatInput.trim() || !chatFriendId) return
    const hasNG = WORD_FILTERS.some(w => chatInput.includes(w))
    if (hasNG) { showToast(T.badWord); return }
    await sendMessage(chatInput.trim()); setChatInput('')
  }

  const fmtTime = (s: number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
  const fmtStudyTime = (s: number) => `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`
  const fmtScheduled = (dt: string) => {
    const d = new Date(dt)
    return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  }

  const weekDays = ['日',lang==='ja'?'月':'Month','火','水','木','金','土']
  const weekDataMap: Record<number,number> = {}
  weeklyStats.forEach((d: any) => { weekDataMap[d.day_of_week] = Number(d.total_seconds) })
  const maxWeek = Math.max(...Object.values(weekDataMap), 3600)
  const today = new Date().getDay()

  const chatFriend = displayFriends.find((f: any) => f.addressee_id === chatFriendId)
  const chatFriendProfile = chatFriend?.profiles as Profile | undefined
  const friendsForTaskPanel = displayFriends.map((f: any) => ({ id: f.addressee_id, display_name: (f.profiles as Profile).display_name, avatar_url: (f.profiles as Profile).avatar_url }))

  const filteredMembers = displayMembers.filter((m: any) => m.user_id !== profile.id && (!showPinnedFilter || pinnedUserIds.includes(m.user_id)))
  const tileCount = filteredMembers.length + 1 + (!showPinnedFilter && filteredMembers.length < 3 ? 1 : 0)
  const gridCols = tileCount <= 1 ? 1 : tileCount <= 4 ? 2 : tileCount <= 9 ? 3 : 4
  const studyingCount = displayMembers.filter((m: any) => m.status === 'studying').length
  const myStatus: 'studying' | 'break' | 'away' = awayModal ? 'away' : timer.mode === 'short' || timer.mode === 'long' ? 'break' : 'studying'
  const statusLabel = (st: string) => st === 'studying' ? (lang==='ja'?'● 集中中':'● Focusing') : st === 'break' ? (lang==='ja'?'☕ 休憩中':'☕ Break') : (lang==='ja'?'😴 離席':'😴 Away')
  const timerModeLabel = timer.mode==='focus'?'集中モード':timer.mode==='short'?'小休憩':timer.mode==='long'?'長休憩':'カスタム'

  return (
    <div className={styles.root}>

      {/* AWAY MODAL */}
      {awayModal && (
        <div className={styles.awayModal}>
          <div className={styles.awayEmoji}>😴</div>
          <div className={styles.awayTitle}>席を外していますか？</div>
          <div className={styles.awayMsg}>しばらく動きが検出されていません。<br/>勉強を続けていますか？</div>
          <div className={styles.awayCountdown}>{awayCountdown}</div>
          <button className={styles.awayBackBtn} onClick={dismissAway}>📚 戻りました！</button>
        </div>
      )}

      {/* MUTUAL PIN NOTIFICATION */}
      {mutualPinNotif && (
        <div className={styles.toast} style={{ background:'rgba(108,138,255,.95)', borderColor:'var(--accent2)', fontWeight:600, bottom:60 }}>
          {mutualPinNotif}
        </div>
      )}
      {toast && <div className={styles.toast}>{toast}</div>}

      {/* Profile Edit Modal */}
      {showProfileEdit && (
        <div className={styles.overlay} onClick={() => setShowProfileEdit(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3>👤 {lang==='ja'?'プロフィール編集':'Edit Profile'}</h3>
            <p style={{ fontSize:13, color:'var(--muted2)', marginBottom:16 }}>
              {lang==='ja'?'表示名を変更できます':'Change your display name'}
            </p>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:6 }}>
                {lang==='ja'?'表示名':'Display Name'}
              </label>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                maxLength={20}
                placeholder={lang==='ja'?'表示名を入力...':'Enter display name...'}
                style={{ width:'100%', padding:'10px 12px', background:'var(--bg3)',
                  border:'1px solid var(--accent)', borderRadius:8, color:'var(--text)',
                  fontSize:14, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }}
                onKeyDown={e => { if (e.key==='Enter') { saveDisplayName(); } }}
                autoFocus
              />
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, textAlign:'right' }}>
                {editName.length}/20
              </div>
            </div>
            <div className={styles.modalBtns}>
              <button className={`${styles.mBtn} ${styles.ghost}`} onClick={() => setShowProfileEdit(false)}>
                {lang==='ja'?'キャンセル':'Cancel'}
              </button>
              <button className={`${styles.mBtn} ${styles.primary}`}
                onClick={saveDisplayName}
                disabled={!editName.trim()}
                style={{ background:'var(--accent)', color:'#fff', border:'none', opacity: editName.trim()?1:0.5 }}>
                {lang==='ja'?'保存':'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BLOCK MODAL */}
      {blockModal && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h3>🚫 ユーザーをブロック</h3>
            <p>「{blockModal.name}」をブロックしますか？</p>
            <div className={styles.modalBtns}>
              <button className={`${styles.mBtn} ${styles.ghost}`} onClick={() => setBlockModal(null)}>キャンセル</button>
              <button className={`${styles.mBtn} ${styles.danger}`} onClick={() => handleBlock(blockModal.userId, blockModal.name)}>ブロック</button>
            </div>
          </div>
        </div>
      )}

      {/* REPORT MODAL */}
      {reportModal && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h3>📢 ユーザーを報告</h3>
            <p>「{reportModal.name}」を報告する理由：</p>
            <div className={styles.reportBtns}>
              {['迷惑行為・荒らし','不適切なカメラ映像','スパム','その他'].map((reason: any) => (
                <button key={reason} className={`${styles.mBtn} ${styles.ghost}`}
                  onClick={() => handleReport(reportModal.userId, reason)}>{reason}</button>
              ))}
            </div>
            <div className={styles.modalBtns}>
              <button className={`${styles.mBtn} ${styles.ghost}`} onClick={() => setReportModal(null)}>キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {/* REACTION MODAL */}
      {reactionTarget && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h3>リアクションを送る</h3>
            <p>「{reactionTarget.name}」さんへ</p>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', justifyContent:'center', margin:'16px 0' }}>
              {REACTION_EMOJIS.map((emoji: any) => (
                <button key={emoji} style={{ fontSize:28, padding:'8px 12px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, cursor:'pointer' }}
                  onClick={async () => {
                    const result = await sendReaction(reactionTarget.userId, emoji)
                    if (result?.success) {
                      setReactionResult(`${emoji} 送りました！`)
                      addNotif(emoji, `「${reactionTarget.name}」さんにリアクションを送りました`)
                      setTimeout(() => { setReactionResult(null); setReactionTarget(null) }, 1500)
                    } else { setReactionResult(result?.error ?? 'エラー'); setTimeout(() => setReactionResult(null), 2000) }
                  }}>{emoji}</button>
              ))}
            </div>
            {reactionResult && <div style={{ textAlign:'center', color:'var(--accent3)', marginBottom:12 }}>{reactionResult}</div>}
            <div className={styles.modalBtns}>
              <button className={`${styles.mBtn} ${styles.ghost}`} onClick={() => { setReactionTarget(null); setReactionResult(null) }}>閉じる</button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM TIMER MODAL */}
      {showCustomTimer && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h3>⏱ カスタムタイマー設定</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:16, margin:'16px 0' }}>
              <div>
                <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:6 }}>集中時間（分）</label>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <input type="range" min="5" max="120" step="5" value={customFocusInput}
                    onChange={e => setCustomFocusInput(Number(e.target.value))}
                    style={{ flex:1 }} />
                  <span style={{ fontFamily:'monospace', fontSize:18, color:'var(--accent)', minWidth:40 }}>{customFocusInput}分</span>
                </div>
              </div>
              <div>
                <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:6 }}>休憩時間（分）</label>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <input type="range" min="1" max="30" step="1" value={customBreakInput}
                    onChange={e => setCustomBreakInput(Number(e.target.value))}
                    style={{ flex:1 }} />
                  <span style={{ fontFamily:'monospace', fontSize:18, color:'var(--accent3)', minWidth:40 }}>{customBreakInput}分</span>
                </div>
              </div>
            </div>
            <div className={styles.modalBtns}>
              <button className={`${styles.mBtn} ${styles.ghost}`} onClick={() => setShowCustomTimer(false)}>キャンセル</button>
              <button className={`${styles.mBtn} ${styles.primary}`}
                onClick={() => { timer.applyCustom(customFocusInput, customBreakInput); setShowCustomTimer(false); showToast(`⏱ ${customFocusInput}分集中タイマーをセットしました`) }}>
                セット
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SESSION SCHEDULER MODAL */}
      {showScheduler && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h3>📅 勉強セッションを予約</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:10, margin:'16px 0' }}>
              <input placeholder="セッションのタイトル（例：英語リスニング集中会）"
                value={schedTitle} onChange={e => setSchedTitle(e.target.value)}
                style={{ padding:'8px 10px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:7, color:'var(--text)', fontSize:13, fontFamily:'inherit', outline:'none' }} />
              <div style={{ display:'flex', gap:8 }}>
                <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)}
                  style={{ flex:1, padding:'8px 10px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:7, color:'var(--text)', fontSize:13, fontFamily:'inherit', outline:'none' }} />
                <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)}
                  style={{ flex:1, padding:'8px 10px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:7, color:'var(--text)', fontSize:13, fontFamily:'inherit', outline:'none' }} />
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <label style={{ fontSize:12, color:'var(--muted)', whiteSpace:'nowrap' }}>時間：</label>
                <select value={schedDuration} onChange={e => setSchedDuration(Number(e.target.value))}
                  style={{ flex:1, padding:'8px 10px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:7, color:'var(--text)', fontSize:13, fontFamily:'inherit', outline:'none' }}>
                  <option value={30}>30分</option>
                  <option value={60}>1時間</option>
                  <option value={90}>1時間30分</option>
                  <option value={120}>2時間</option>
                </select>
              </div>
            </div>
            <div className={styles.modalBtns}>
              <button className={`${styles.mBtn} ${styles.ghost}`} onClick={() => setShowScheduler(false)}>キャンセル</button>
              <button className={`${styles.mBtn} ${styles.primary}`} onClick={scheduleSession}>予約する</button>
            </div>
          </div>
        </div>
      )}

      {/* SUBJECT PICKER */}
      {showSubjectPicker && (
        <div className={styles.overlay} onClick={() => setShowSubjectPicker(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3>{lang==='ja'?'🎯 勉強科目':'🎯 Subject'}を選択</h3>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, margin:'16px 0' }}>
              {SUBJECTS.map((s: any) => (
                <button key={s}
                  style={{ padding:'6px 14px', borderRadius:20, border:`1px solid ${mySubject===s?'var(--accent)':'var(--border)'}`, background:mySubject===s?'rgba(108,138,255,.15)':'var(--bg3)', color:mySubject===s?'var(--accent)':'var(--muted2)', fontSize:13, cursor:'pointer', fontFamily:'inherit', transition:'.15s' }}
                  onClick={() => changeSubject(s)}>{s}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>📚</div>
          <span>{lang==='ja'?'自習室 JP':'Study With Me JP'}</span>
        </div>
        <div className={styles.headerCenter}>
          <div className={styles.onlineBadge}><span className={styles.liveDot}/>{presence.studyingCount}{lang==='ja'?'人が勉強中':' studying now'} · {presence.onlineCount}{lang==='ja'?'人オンライン':' online'}</div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.clock}>{currentTime}</div>
          <button onClick={toggleLang}
            style={{ padding:'4px 10px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:6, color:'var(--muted2)', fontSize:11, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>
            {lang === 'ja' ? '🇬🇧 EN' : '🇯🇵 JP'}
          </button>
          <div className={styles.avatarBtn} onClick={() => { setEditName(profile.display_name); setShowProfileEdit(true) }}
            style={{ cursor:'pointer' }} title={lang==='ja'?'名前を変更':'Edit name'}>
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" width={32} height={32} style={{ borderRadius:'50%', objectFit:'cover' }}/> : profile.display_name[0]}
          </div>
          <button className={styles.signOutBtn} onClick={() => signOut({ callbackUrl:'/' })}>{T.logout}</button>
        </div>
      </header>

      {/* DESKTOP LAYOUT — Study Stream style: video stage + dock + slide-in drawer */}
      <div className={styles.desktopLayout}>

        {/* STAGE */}
        <main className={styles.ssStage}>

          {/* Top row: room info / timer pill / current task */}
          <div className={styles.ssTopRow}>
            <button className={styles.ssRoomInfo} onClick={() => togglePanel('rooms')} title={lang==='ja'?'ルームを切り替え':'Switch room'}>
              <span className={styles.ssRoomEmoji}>{room.emoji ?? '📚'}</span>
              <div style={{ minWidth:0 }}>
                <div className={styles.ssRoomName}>{room.name} ▾</div>
                <div className={styles.ssRoomMeta}>
                  <span className={styles.liveDot}/> {studyingCount}{lang==='ja'?'人が集中中':' focusing'} · {displayMembers.length}{lang==='ja'?'人が入室':' in room'}
                </div>
              </div>
            </button>

            <div className={`${styles.ssTimerPill} ${timer.mode==='focus'||timer.mode==='custom'?styles.ssTimerFocus:styles.ssTimerBreak}`}>
              <button className={styles.ssTimerMain} onClick={() => togglePanel('timer')} title={lang==='ja'?'タイマー設定':'Timer settings'}>
                <span className={styles.ssTimerMode}>{timerModeLabel}</span>
                <span className={styles.ssTimerDigits}>{fmtTime(timer.seconds)}</span>
              </button>
              <button className={styles.ssTimerPlay} onClick={timer.toggle} aria-label={timer.running?'pause':'start'}>
                {timer.running ? '❚❚' : '▶'}
              </button>
              <div className={styles.ssTimerBar} style={{ width:`${timer.progress*100}%` }}/>
            </div>

            <button className={styles.ssTaskPill} onClick={() => togglePanel('tasks')}>
              <span className={styles.ssTaskLbl}>{T.currentTask}</span>
              <span className={styles.ssTaskTxt}>{currentTask}</span>
            </button>
          </div>

          {/* Video grid */}
          <div className={styles.ssGridWrap}>
            <div className={styles.ssGrid} style={{ gridTemplateColumns:`repeat(${gridCols}, minmax(0, 1fr))`, maxWidth: gridCols === 1 ? 880 : gridCols === 2 ? 1200 : undefined }}>

              {/* My tile */}
              <div className={`${styles.ssTile} ${styles.ssTileMe}`}>
                {localStream
                  ? <video className={`${styles.ssVideo} ${styles.ssVideoMirror}`} ref={v => { if (v && v.srcObject !== localStream) { v.srcObject = localStream; (faceVideoRef as any).current = v } }} autoPlay muted playsInline/>
                  : <div className={styles.ssTileOff}>
                      <div className={styles.ssAvatar} style={{ background:'rgba(108,138,255,.2)', color:'var(--accent)' }}>
                        {profile.avatar_url ? <img src={profile.avatar_url} alt=""/> : profile.display_name[0]}
                      </div>
                      <button className={styles.ssCamCta} onClick={() => setCameraOn(true)}>📷 {lang==='ja'?'カメラをONにする':'Turn camera on'}</button>
                    </div>}
                <div className={styles.ssTileTop}>
                  <span className={`${styles.ssStatus} ${myStatus==='studying'?styles.ssStatusStudy:myStatus==='break'?styles.ssStatusBreak:styles.ssStatusAway}`}>
                    {statusLabel(myStatus)}
                  </span>
                  {streak > 0 && <span className={styles.ssChip}>🔥{streak}</span>}
                </div>
                <div className={styles.ssTileBottom}>
                  <span className={styles.ssName}>{profile.display_name} <span style={{ opacity:.6 }}>{lang==='ja'?'(あなた)':'(you)'}</span></span>
                  {mySubject && <span className={styles.ssChip}>{mySubject}</span>}
                </div>
                {(() => { const dm = dailyMessages.find((d: any) => d.user_id === profile.id); return dm ? <div className={styles.ssBubble}>💬 {dm.content}</div> : null })()}
              </div>

              {/* Other members */}
              {filteredMembers.map((m, idx) => {
                const rs = remoteStreams.get(m.user_id)
                const mp = m.profiles as { display_name: string; avatar_url: string | null }
                const isPinnedUser = isPinned(m.user_id)
                const color = SEAT_COLORS[(idx + 1) % SEAT_COLORS.length]
                const rxs = getReactionsFor(m.user_id)
                const dm = dailyMessages.find((d: any) => d.user_id === m.user_id)
                const memberSubject = m.current_task
                const isFriend = displayFriends.some((f:any) => f.addressee_id === m.user_id)
                const isPending = pendingIn.some((p:any) => p.requester_id === m.user_id)
                return (
                  <div key={m.id} className={`${styles.ssTile} ${isPinnedUser?styles.ssTilePinned:''} ${m.status==='away'?styles.ssTileAway:''}`}>
                    {rs
                      ? <video className={styles.ssVideo} ref={v => { if (v && v.srcObject !== rs) v.srcObject = rs }} autoPlay playsInline/>
                      : <div className={styles.ssTileOff}>
                          <div className={styles.ssAvatar} style={{ background:`${color}22`, color }}>
                            {mp.avatar_url ? <img src={mp.avatar_url} alt=""/> : mp.display_name[0]}
                          </div>
                        </div>}
                    <div className={styles.ssTileTop}>
                      <span className={`${styles.ssStatus} ${m.status==='studying'?styles.ssStatusStudy:m.status==='break'?styles.ssStatusBreak:styles.ssStatusAway}`}>
                        {statusLabel(m.status)}
                      </span>
                      {isPinnedUser && <span className={styles.ssChip}>📌</span>}
                      {rxs.length > 0 && <span className={styles.ssChip}>{rxs.slice(-3).map(r => r.emoji).join('')}</span>}
                    </div>
                    <div className={styles.ssTileActions}>
                      <button title={lang==='ja'?'リアクション':'React'} onClick={() => setReactionTarget({ userId:m.user_id, name:mp.display_name })}>😊</button>
                      <button title={isPinnedUser?(lang==='ja'?'ピン解除':'Unpin'):(lang==='ja'?'ピン留め':'Pin')} onClick={() => togglePin(m.user_id)} style={{ opacity:isPinnedUser?1:.6 }}>📌</button>
                      {isFriend ? (
                        <button title={lang==='ja'?'チャット':'Chat'} onClick={() => openChat(m.user_id)}>💬</button>
                      ) : isPending ? (
                        <button title={lang==='ja'?'申請中':'Pending'} disabled>⏳</button>
                      ) : (
                        <button title={lang==='ja'?'フレンド申請':'Add Friend'} onClick={async () => {
                          const result = await sendFriendRequest(m.user_id)
                          if (result === 'sent') {
                            showToast(lang==='ja'?`👋 ${mp.display_name}さんにフレンド申請しました！`:`👋 Friend request sent to ${mp.display_name}!`)
                            addNotif('👋', lang==='ja'?`${mp.display_name}さんにフレンド申請しました`:`Friend request sent to ${mp.display_name}`)
                          } else {
                            showToast(lang==='ja'?'既に申請済みです':'Already requested')
                          }
                        }}>➕</button>
                      )}
                      <button title={lang==='ja'?'報告':'Report'} onClick={() => setReportModal({ userId:m.user_id, name:mp.display_name })}>⚠️</button>
                    </div>
                    <div className={styles.ssTileBottom}>
                      <span className={styles.ssName}>{mp.display_name}</span>
                      {memberSubject && <span className={styles.ssChip} style={{ color }}>{memberSubject}</span>}
                    </div>
                    {dm && <div className={styles.ssBubble}>💬 {dm.content}</div>}
                  </div>
                )
              })}

              {/* Invite tile when the room is quiet */}
              {!showPinnedFilter && filteredMembers.length < 3 && (
                <div className={`${styles.ssTile} ${styles.ssTileEmpty}`}>
                  <div className={styles.ssTileOff}>
                    <div style={{ fontSize:28, opacity:.5 }}>🪑</div>
                    <div style={{ fontSize:12, color:'var(--muted)' }}>{lang==='ja'?'もうすぐ誰かが来るかも…':'Someone may join soon…'}</div>
                    <button className={styles.ssCamCta} onClick={() => togglePanel('rooms')}>🏠 {lang==='ja'?'他のルームを見る':'Browse rooms'}</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* DOCK */}
          <div className={styles.ssDock}>
            <button className={`${styles.ssDockBtn} ${cameraOn?styles.ssDockOn:styles.ssDockOff}`} onClick={() => setCameraOn(v => !v)} title={cameraOn?T.cameraOn:T.cameraOff}>
              <span className={styles.ssDockIcon}>📷</span>
              <span className={styles.ssDockLbl}>{cameraOn?(lang==='ja'?'カメラON':'Cam on'):(lang==='ja'?'カメラOFF':'Cam off')}</span>
            </button>
            <div className={`${styles.ssDockBtn} ${styles.ssDockOff}`} title={T.noTalk} style={{ cursor:'default' }}>
              <span className={styles.ssDockIcon}>🔇</span>
              <span className={styles.ssDockLbl}>{lang==='ja'?'マイク禁止':'No mic'}</span>
            </div>
            <div className={styles.ssDockSep}/>
            {DOCK_PANELS.map(p => {
              const badge = p.id === 'friends' ? pendingIn.length + Object.values(unreadCounts).reduce((a, b) => a + b, 0) : 0
              return (
                <button key={p.id} className={`${styles.ssDockBtn} ${panel===p.id?styles.ssDockActive:''}`} onClick={() => togglePanel(p.id)}>
                  <span className={styles.ssDockIcon}>{p.icon}{badge > 0 && <span className={styles.ssDockBadge}>{badge}</span>}</span>
                  <span className={styles.ssDockLbl}>{lang==='ja'?p.ja:p.en}</span>
                </button>
              )
            })}
            <div className={styles.ssDockSep}/>
            <button className={`${styles.ssDockBtn} ${showPinnedFilter?styles.ssDockActive:''}`} onClick={() => setShowPinnedFilter(v => !v)} title={T.pinnedOnly}>
              <span className={styles.ssDockIcon}>📌</span>
              <span className={styles.ssDockLbl}>{lang==='ja'?'ピン':'Pinned'}</span>
            </button>
            <button className={styles.ssDockBtn} onClick={() => setZen(true)} title={lang==='ja'?'集中モード (Esc で戻る)':'Focus mode (Esc to exit)'}>
              <span className={styles.ssDockIcon}>🧘</span>
              <span className={styles.ssDockLbl}>{lang==='ja'?'集中':'Focus'}</span>
            </button>
            <button className={`${styles.ssDockBtn} ${styles.ssDockLeave}`} onClick={leaveRoom}>
              <span className={styles.ssDockIcon}>🚪</span>
              <span className={styles.ssDockLbl}>{T.leaveRoom}</span>
            </button>
          </div>

          {/* ZEN / FOCUS MODE */}
          {zen && (
            <div className={styles.ssZen} onClick={() => setZen(false)}>
              <div className={styles.ssZenMode}>{timerModeLabel}</div>
              <div className={styles.ssZenDigits}>{fmtTime(timer.seconds)}</div>
              <div className={styles.ssZenTask}>{currentTask}</div>
              <div className={styles.ssZenBtns} onClick={e => e.stopPropagation()}>
                <button className={styles.btnStart} onClick={timer.toggle}>{timer.running?T.pause:T.start}</button>
                <button className={styles.btnReset} onClick={() => setZen(false)}>✕ {lang==='ja'?'戻る':'Exit'}</button>
              </div>
              <div className={styles.ssZenHint}>{studyingCount}{lang==='ja'?'人があなたと一緒に集中しています':' people are focusing with you'}</div>
            </div>
          )}
        </main>

        {/* DRAWER */}
        <aside className={`${styles.ssDrawer} ${panel || chatFriendId ? styles.ssDrawerOpen : ''}`}>
          {chatFriendId && chatFriendProfile ? (
            <div className={styles.chatWrap}>
              <div className={styles.chatHeader}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div className={styles.chatAvatar}>
                    {chatFriendProfile.avatar_url ? <img src={chatFriendProfile.avatar_url} alt="" width={28} height={28} style={{ borderRadius:'50%' }}/> : chatFriendProfile.display_name[0]}
                  </div>
                  <div>
                    <div style={{ fontWeight:600, fontSize:13 }}>{chatFriendProfile.display_name}</div>
                    <div style={{ fontSize:10, color:'var(--accent3)' }}>● オンライン</div>
                  </div>
                </div>
                <button className={styles.chatClose} onClick={() => setChatFriendId(null)}>✕</button>
              </div>
              <div className={styles.chatMsgs}>
                {chatMessages.map((msg: any) => (
                  <div key={msg.id} className={`${styles.msg} ${msg.sender_id===profile.id?styles.msgMe:styles.msgThem}`}>
                    <div className={styles.msgBubble}>{msg.content}</div>
                    <div className={styles.msgTime}>{new Date(msg.created_at).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}</div>
                  </div>
                ))}
                <div ref={chatEndRef}/>
              </div>
              <div className={styles.chatInputRow}>
                <input className={styles.chatInput} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key==='Enter'&&handleSendMsg()} placeholder={T.messagePlaceholder}/>
                <button className={styles.chatSend} onClick={handleSendMsg}>{T.send}</button>
              </div>
            </div>
          ) : panel && (
            <>
              <div className={styles.ssDrawerHead}>
                <span>{DOCK_PANELS.find(p => p.id === panel)?.icon} {lang==='ja'?DOCK_PANELS.find(p => p.id === panel)?.ja:DOCK_PANELS.find(p => p.id === panel)?.en}</span>
                <button className={styles.chatClose} onClick={() => setPanel(null)}>✕</button>
              </div>
              <div className={styles.srPanel}>

                {panel==='timer' && (
                  <>
                    <div>
                      <div className={styles.timerModes}>
                        {(['focus','short','long'] as const).map((m,i) => (
                          <button key={m} className={`${styles.modeBtn} ${timer.mode===m?styles.modeBtnActive:''}`} onClick={() => timer.switchMode(m)}>
                            {['集中','小休憩','長休憩'][i]}
                          </button>
                        ))}
                        <button className={`${styles.modeBtn} ${timer.mode==='custom'?styles.modeBtnActive:''}`}
                          onClick={() => setShowCustomTimer(true)}>カスタム</button>
                      </div>
                      {timer.mode === 'custom' && (
                        <div style={{ textAlign:'center', fontSize:11, color:'var(--accent)', marginBottom:6 }}>
                          集中{timer.customFocusMins}分 / 休憩{timer.customBreakMins}分
                          <button onClick={() => setShowCustomTimer(true)} style={{ marginLeft:6, fontSize:10, color:'var(--muted)', background:'transparent', border:'none', cursor:'pointer' }}>変更</button>
                        </div>
                      )}
                      <div className={styles.ringWrap}>
                        <svg className={styles.timerRing} width="170" height="170" viewBox="0 0 110 110">
                          <defs>
                            <linearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#6c8aff"/><stop offset="100%" stopColor="#a78bfa"/>
                            </linearGradient>
                          </defs>
                          <circle className={styles.ringBg} cx="55" cy="55" r="50"/>
                          <circle className={styles.ringProg} cx="55" cy="55" r="50" strokeDasharray="314.2" strokeDashoffset={314.2 - timer.progress * 314.2}/>
                        </svg>
                        <div className={styles.ringInner}>
                          <div className={styles.timerDigits}>{fmtTime(timer.seconds)}</div>
                          <div className={styles.timerLbl}>{timerModeLabel}</div>
                        </div>
                      </div>
                      <div className={styles.timerCtrl}>
                        <button className={styles.btnStart} onClick={timer.toggle}>{timer.running?T.pause:T.start}</button>
                        <button className={styles.btnReset} onClick={timer.reset}>↺</button>
                      </div>
                      <div className={styles.pomoDots}>
                        {[0,1,2,3].map((i: any) => <div key={i} className={`${styles.pdot} ${i<(timer.pomosCompleted%4)?styles.pdotDone:''}`}/>)}
                      </div>
                      <div style={{ textAlign:'center', fontSize:11, color:'var(--muted)', marginTop:8 }}>{lang==='ja'?'セッション':'Session'} {timer.sessionCount} / 4</div>
                    </div>
                    <div>
                      <div className={styles.secLabel}>{lang==='ja'?'🎯 勉強科目':'🎯 Subject'}</div>
                      <button onClick={() => setShowSubjectPicker(true)} style={{ width:'100%', padding:'8px 12px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, color:mySubject?'var(--accent)':'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:'inherit', textAlign:'left', transition:'.2s' }}>
                        {mySubject || '科目を選択...'} ▾
                      </button>
                    </div>
                  </>
                )}

                {panel==='tasks' && (
                  <>
                    <div>
                      <div className={styles.secLabel}>{lang==='ja'?'💬 今日の一言':'💬 Status message'}</div>
                      <div style={{ display:'flex', gap:6 }}>
                        <input placeholder={lang==='ja'?'今日の一言を投稿...':'Share what you are working on...'}
                          value={dailyMsgInput} onChange={e => setDailyMsgInput(e.target.value)}
                          onKeyDown={e => { if (e.key==='Enter') { saveDailyMessage(dailyMsgInput); setDailyMsgInput('') } }}
                          className={styles.tInput}/>
                        <button onClick={() => { saveDailyMessage(dailyMsgInput); setDailyMsgInput('') }} className={styles.chatSend}>{lang==='ja'?'投稿':'Post'}</button>
                      </div>
                    </div>
                    <div>
                      <div className={styles.secLabel}>{lang==='ja'?'✅ タスク':'✅ Tasks'}</div>
                      <TaskPanel userId={profile.id} roomId={room.id} tasks={tasks}
                        onAddTask={addTask} onCompleteTask={completeTask} onDeleteTask={deleteTask}
                        onUpdateShare={updateTaskShareLocal}
                        friends={friendsForTaskPanel}/>
                    </div>
                  </>
                )}

                {panel==='stats' && (
                  <>
                    <div>
                      <div className={styles.secLabel}>{T.today}</div>
                      <div className={styles.statCards}>
                        <div className={styles.statCard}><div className={styles.statVal}>{fmtStudyTime(todaySeconds)}</div><div className={styles.statSub}>{T.totalStudy}</div></div>
                        <div className={styles.statCard}><div className={styles.statVal}>{pomosToday}</div><div className={styles.statSub}>{T.pomodoros}</div></div>
                        <div className={styles.statCard}><div className={styles.statVal}>{streak}🔥</div><div className={styles.statSub}>{T.streak}</div></div>
                        <div className={styles.statCard}><div className={styles.statVal}>{tasksDoneToday}</div><div className={styles.statSub}>{T.tasksDone}</div></div>
                      </div>
                    </div>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                        <div className={styles.secLabel} style={{ marginBottom:0 }}>{statView==='week'?'今週':'今月'}</div>
                        <div style={{ display:'flex', gap:4 }}>
                          <button onClick={() => setStatView('week')} style={{ padding:'2px 8px', borderRadius:4, border:`1px solid ${statView==='week'?'var(--accent)':'var(--border)'}`, background:statView==='week'?'rgba(108,138,255,.15)':'transparent', color:statView==='week'?'var(--accent)':'var(--muted)', fontSize:10, cursor:'pointer', fontFamily:'inherit' }}>週</button>
                          <button onClick={() => setStatView('month')} style={{ padding:'2px 8px', borderRadius:4, border:`1px solid ${statView==='month'?'var(--accent)':'var(--border)'}`, background:statView==='month'?'rgba(108,138,255,.15)':'transparent', color:statView==='month'?'var(--accent)':'var(--muted)', fontSize:10, cursor:'pointer', fontFamily:'inherit' }}>月</button>
                        </div>
                      </div>
                      {statView==='week' ? (
                        <div className={styles.weekChart}>
                          {weekDays.map((d,i) => {
                            const secs = weekDataMap[i] || 0
                            const h = Math.max((secs/maxWeek)*100, 3)
                            return (
                              <div key={d} className={styles.wbarWrap}>
                                <div className={`${styles.wbar} ${i===today?styles.wbarToday:''}`} style={{ height:`${h}%` }}/>
                                <div className={styles.wlbl}>{d}</div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div style={{ display:'flex', alignItems:'flex-end', gap:2, height:56 }}>
                          {monthStats.map((d: any) => {
                            const max = Math.max(...monthStats.map((s: any) => s.total_seconds), 3600)
                            const h = Math.max((d.total_seconds/max)*100, 3)
                            return (
                              <div key={d.day} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2, height:'100%', justifyContent:'flex-end' }}>
                                <div style={{ width:'100%', background:'var(--accent)', borderRadius:'2px 2px 0 0', opacity: d.day===new Date().getDate()?1:.5, height:`${h}%`, minHeight:2 }}/>
                                {d.day % 5 === 0 && <div style={{ fontSize:8, color:'var(--muted)' }}>{d.day}</div>}
                              </div>
                            )
                          })}
                          {monthStats.length===0 && <div style={{ fontSize:11, color:'var(--muted)', textAlign:'center', width:'100%' }}>今月のデータなし</div>}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className={styles.secLabel}>{T.quote}</div>
                      <div className={styles.quoteBox}>「{quote.text}」<div className={styles.quoteAuthor}>— {quote.author}</div></div>
                    </div>
                  </>
                )}

                {panel==='ranking' && (
                  <RankingPanel userId={profile.id} roomId={room.id} lang={lang} refreshKey={rankRefresh}/>
                )}

                {panel==='music' && (
                  <>
                    <div className={styles.bgmList}>
                      {BGM_TRACKS.map((t: any) => (
                        <div key={t.id} className={`${styles.bgmItem} ${bgmPlaying===t.id?styles.bgmPlaying:''}`} onClick={() => toggleBgm(t.id)}>
                          <span>{t.icon}</span>
                          <span style={{ flex:1, color:'var(--muted2)', fontSize:12 }}>{t.name}</span>
                          <div className={styles.bgmPlay}>{bgmPlaying===t.id?'♪':'▶'}</div>
                        </div>
                      ))}
                    </div>
                    <div className={styles.volRow}>
                      <span style={{ fontSize:11, color:'var(--muted)' }}>🔊</span>
                      <input type="range" className={styles.volSlider} min="0" max="1" step="0.01" value={volume}
                        onChange={e => { const v=parseFloat(e.target.value); setVolume(v); if(bgmGainRef.current) bgmGainRef.current.gain.value=v }}/>
                      <span style={{ fontSize:11, color:'var(--muted)' }}>{Math.round(volume*100)}%</span>
                    </div>
                  </>
                )}

                {panel==='friends' && (
                  <>
                    {pendingIn.length > 0 && (
                      <div>
                        {pendingIn.map((req: any) => {
                          const rp = req.profiles
                          return (
                            <div key={req.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', background:'rgba(108,138,255,.08)', border:'1px solid rgba(108,138,255,.3)', borderRadius:8, marginBottom:5 }}>
                              <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0, overflow:'hidden' }}>
                                {rp?.avatar_url ? <img src={rp.avatar_url} width={28} height={28} style={{ borderRadius:'50%' }} alt=""/> : rp?.display_name?.[0]}
                              </div>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:12, fontWeight:600 }}>{rp?.display_name}</div>
                                <div style={{ fontSize:10, color:'var(--muted)' }}>{lang==='ja'?'フレンド申請が届いています':'Friend request'}</div>
                              </div>
                              <button onClick={() => { acceptFriendRequest(req.id); showToast(lang==='ja'?`✅ ${rp?.display_name}さんとフレンドになりました`:`✅ Now friends with ${rp?.display_name}`) }}
                                style={{ padding:'4px 10px', background:'var(--accent)', border:'none', borderRadius:6, color:'#fff', fontSize:11, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>
                                {lang==='ja'?'承認':'Accept'}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <div className={styles.friendList}>
                      {displayFriends.map((f: any) => {
                        const fp = f.profiles as Profile
                        const unread = unreadCounts[f.addressee_id] || 0
                        return (
                          <div key={f.id} className={styles.friendItem} onClick={() => openChat(f.addressee_id)}>
                            <div className={styles.friendAvatar}>
                              {fp.avatar_url ? <img src={fp.avatar_url} alt="" width={30} height={30} style={{ borderRadius:'50%', objectFit:'cover' }}/> : fp.display_name[0]}
                              <div className={styles.friendDot}/>
                            </div>
                            <div className={styles.friendInfo}>
                              <div className={styles.friendName}>{fp.display_name}{unread>0&&<span className={styles.unreadBadge}>{unread}</span>}</div>
                              <div className={styles.friendMeta}>勉強中</div>
                            </div>
                            <div className={styles.friendActions}>
                              <button className={`${styles.faBtn} ${styles.faBtnChat}`} onClick={e => { e.stopPropagation(); openChat(f.addressee_id) }}>💬</button>
                              <button className={`${styles.faBtn} ${styles.faBtnBlock}`} onClick={e => { e.stopPropagation(); setBlockModal({ userId:f.addressee_id, name:fp.display_name }) }}>🚫</button>
                            </div>
                          </div>
                        )
                      })}
                      {displayFriends.length===0&&<div style={{ fontSize:11, color:'var(--muted)', textAlign:'center', padding:'12px 0' }}>{T.noFriends}</div>}
                    </div>
                  </>
                )}

                {panel==='rooms' && (
                  <div className={styles.ssRoomList}>
                    {allRooms.map((r: any) => (
                      <div key={r.id} className={`${styles.roomCard} ${r.id===room.id?styles.roomCardActive:''}`} onClick={() => r.id !== room.id && router.push(`/room/${r.id}`)}>
                        <div className={styles.roomName}>{r.emoji} {r.name}{r.id===room.id && <span style={{ marginLeft:6, fontSize:10, color:'var(--accent3)' }}>● {lang==='ja'?'入室中':'Here'}</span>}</div>
                        <div className={styles.roomDesc}>{r.description}</div>
                      </div>
                    ))}
                  </div>
                )}

                {panel==='activity' && (
                  <div className={styles.notifList}>
                    {notifications.map((n,i) => (
                      <div key={i} className={styles.notifItem}>
                        <span>{n.icon}</span>
                        <div><div style={{ fontSize:11 }}>{n.text}</div><div style={{ fontSize:9, color:'var(--muted)', marginTop:2 }}>{n.time}</div></div>
                      </div>
                    ))}
                  </div>
                )}

                {panel==='safety' && (
                  <SafetyPanel
                    userId={profile.id}
                    cameraOn={cameraOn}
                    faceDetectEnabled={faceDetectEnabled}
                    noFaceThreshold={noFaceThreshold}
                    awayEnabled={awayEnabled}
                    awayMinutes={awayMinutes}
                    faceStatus={faceStatus}
                    noFaceSeconds={noFaceSeconds}
                    lang={lang}
                    onFaceDetectChange={setFaceDetectEnabled}
                    onNoFaceThresholdChange={setNoFaceThreshold}
                    onAwayEnabledChange={setAwayEnabled}
                    onAwayMinutesChange={setAwayMinutes}
                  />
                )}

                {panel==='schedule' && (
                  <>
                    <button onClick={() => setShowScheduler(true)} style={{ width:'100%', padding:'9px', background:'var(--accent)', border:'none', borderRadius:8, color:'#fff', fontSize:12, cursor:'pointer', fontFamily:'inherit', marginBottom:10 }}>
                      + セッションを予約する
                    </button>
                    <TimelineCalendar
                      userId={profile.id}
                      roomId={room.id}
                      tasks={tasks}
                      scheduledSessions={scheduledSessions}
                      onJoinSession={async (s) => {
                        const { data: sess } = await (supabase as any).from('scheduled_sessions')
                          .select('room_id')
                          .eq('id', s.id)
                          .single()
                        if ((sess as any)?.room_id) {
                          await (supabase as any).from('session_participants').upsert(
                            { session_id: s.id, user_id: profile.id },
                            { onConflict: 'session_id,user_id' }
                          )
                          router.push('/room/' + sess.room_id)
                        }
                      }}
                    />
                    {scheduledSessions.length===0 ? (
                      <div style={{ fontSize:12, color:'var(--muted)', textAlign:'center', padding:'20px 0' }}>{T.noSessions}</div>
                    ) : scheduledSessions.map((s: any) => {
                      const nowT = new Date()
                      const startT = new Date(s.scheduled_at)
                      const diffMin = Math.round((startT.getTime() - nowT.getTime()) / 60000)
                      const isStarting = diffMin <= 0 && diffMin > -s.duration_mins
                      const isSoon = diffMin > 0 && diffMin <= 10
                      const isPast = diffMin <= -s.duration_mins
                      const borderColor = isStarting ? 'var(--accent3)' : isSoon ? 'var(--warn)' : 'var(--border)'
                      const badgeText = isStarting ? '🟢 進行中' : isSoon ? ('⏰ ' + diffMin + '分後') : isPast ? '終了' : fmtScheduled(s.scheduled_at)
                      const badgeColor = isStarting ? 'var(--accent3)' : isSoon ? 'var(--warn)' : isPast ? 'var(--muted)' : 'var(--muted2)'
                      const badgeBg = isStarting ? 'rgba(52,211,153,.12)' : isSoon ? 'rgba(245,158,11,.12)' : 'transparent'
                      return (
                        <div key={s.id} style={{ background:'var(--bg3)', border:'1px solid '+borderColor, borderRadius:10, padding:'12px', marginBottom:8, opacity: isPast ? .5 : 1 }}>
                          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:4 }}>
                            <div style={{ fontSize:13, fontWeight:500, flex:1 }}>{s.title}</div>
                            <span style={{ fontSize:10, padding:'2px 7px', borderRadius:10, background:badgeBg, color:badgeColor, whiteSpace:'nowrap', marginLeft:6 }}>
                              {badgeText}
                            </span>
                          </div>
                          <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>
                            ⏱ {s.duration_mins}分
                            {s.subject && <span> · 🎯 {s.subject}</span>}
                          </div>
                          <div style={{ fontSize:10, color:'var(--muted)', marginBottom:8 }}>
                            主催: {(s.profiles as { display_name: string } | undefined)?.display_name ?? 'あなた'}
                          </div>
                          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                            {s.host_id !== profile.id && !isPast && (
                              <button onClick={() => joinSession(s.id)}
                                style={{ padding:'5px 12px', background:'rgba(108,138,255,.12)', border:'1px solid rgba(108,138,255,.25)', borderRadius:6, color:'var(--accent)', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
                                ✋ 参加登録
                              </button>
                            )}
                            {(isStarting || isSoon) && (
                              <button onClick={async () => {
                                // Get the session's private room and navigate there
                                const { data: sess } = await (supabase as any).from('scheduled_sessions')
                                  .select('room_id')
                                  .eq('id', s.id)
                                  .single()
                                if ((sess as any)?.room_id) {
                                  // Join as participant first
                                  await (supabase as any).from('session_participants').upsert(
                                    { session_id: s.id, user_id: profile.id },
                                    { onConflict: 'session_id,user_id' }
                                  )
                                  router.push('/room/' + sess.room_id)
                                } else {
                                  showToast('❌ ルーム情報が取得できませんでした')
                                }
                              }}
                                style={{ padding:'5px 12px', background: isStarting ? 'var(--accent3)' : 'var(--warn)', border:'none', borderRadius:6, color:'#000', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                                {isStarting ? '🚀 専用ルームへ入室' : '📍 準備する'}
                              </button>
                            )}
                            {s.host_id === profile.id && (
                              <button onClick={async () => {
                                await (supabase as any).from('scheduled_sessions').delete().eq('id', s.id)
                                fetchSessions()
                                showToast('🗑 予約を削除しました')
                              }}
                                style={{ padding:'5px 10px', background:'transparent', border:'1px solid var(--border)', borderRadius:6, color:'var(--muted)', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
                                🗑 削除
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}

              </div>
            </>
          )}
        </aside>
      </div>

      {/* MOBILE */}
      <div className={styles.mobContent}>
        <MobileScreens
          activeScreen={activeMobScreen} profile={profile} room={room} allRooms={allRooms}
          timer={timer} members={displayMembers} friends={displayFriends} pendingIn={pendingIn}
          unreadCounts={unreadCounts} tasks={tasks} localStream={localStream} remoteStreams={remoteStreams}
          cameraOn={cameraOn} bgmPlaying={bgmPlaying} volume={volume} bgmGainRef={bgmGainRef}
          notifications={notifications} weeklyStats={weeklyStats} currentTask={currentTask}
          onToggleCamera={() => setCameraOn(v => !v)}
          onAddTask={addTask} onCompleteTask={completeTask} onDeleteTask={deleteTask}
          onOpenChat={(fid) => setChatFriendId(fid)}
          onBlock={(uid,name) => setBlockModal({ userId:uid, name })}
          onReport={(uid,name) => setReportModal({ userId:uid, name })}
          onAcceptFriend={acceptFriendRequest}
          onToggleBgm={toggleBgm} onSetVolume={setVolume}
          onJoinRoom={(rid) => router.push(`/room/${rid}`)}
          onLeaveRoom={() => router.push('/')}
          todaySeconds={todaySeconds} pomosToday={pomosToday} tasksDoneToday={tasksDoneToday}
          lang={lang}
          onUpdateShare={updateTaskShareLocal}
          faceDetectEnabled={faceDetectEnabled}
          noFaceThreshold={noFaceThreshold}
          awayEnabled={awayEnabled}
          awayMinutes={awayMinutes}
          faceStatus={faceStatus}
          noFaceSeconds={noFaceSeconds}
          onFaceDetectChange={setFaceDetectEnabled}
          onNoFaceThresholdChange={setNoFaceThreshold}
          onAwayEnabledChange={setAwayEnabled}
          onAwayMinutesChange={setAwayMinutes}
          cameraOnForSafety={cameraOn}
          userId={profile.id}
          rankRefresh={rankRefresh}
        />
      </div>

      {/* MOBILE CHAT */}
      {chatFriendId && chatFriendProfile && (
        <div className={`${styles.mobChatOverlay} ${styles.mobChatOverlayActive}`}>
          <div className={styles.mobChatHeader}>
            <button className={styles.mobChatBack} onClick={() => setChatFriendId(null)}>‹</button>
            <div className={styles.chatAvatar}>
              {chatFriendProfile.avatar_url ? <img src={chatFriendProfile.avatar_url} alt="" width={32} height={32} style={{ borderRadius:'50%' }}/> : chatFriendProfile.display_name[0]}
            </div>
            <div>
              <div style={{ fontWeight:600, fontSize:14 }}>{chatFriendProfile.display_name}</div>
              <div style={{ fontSize:11, color:'var(--accent3)' }}>● オンライン</div>
            </div>
          </div>
          <div className={styles.mobChatMsgs}>
            {chatMessages.map((msg: any) => (
              <div key={msg.id} className={`${styles.msg} ${msg.sender_id===profile.id?styles.msgMe:styles.msgThem}`}>
                <div className={styles.msgBubble}>{msg.content}</div>
                <div className={styles.msgTime}>{new Date(msg.created_at).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}</div>
              </div>
            ))}
            <div ref={chatEndRef}/>
          </div>
          <div className={styles.mobChatInputRow}>
            <input className={styles.chatInput} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key==='Enter'&&handleSendMsg()} placeholder={T.messagePlaceholder}/>
            <button className={styles.chatSend} onClick={handleSendMsg}>{T.send}</button>
          </div>
        </div>
      )}

      {/* MOBILE BOTTOM NAV */}
      <nav className={styles.bottomNav}>
        {(['timer','room','friends','stats'] as const).map((screen,i) => {
          const hasNotif = screen==='friends' && (pendingIn.length>0 || Object.values(unreadCounts).some(c=>c>0))
          return (
            <button key={screen} className={`${styles.bnavBtn} ${activeMobScreen===screen?styles.bnavBtnActive:''}`} onClick={() => setActiveMobScreen(screen)}>
              <div className={styles.bnavIcon} style={{ position:'relative' }}>
                {['⏱','🎥','👥','📊'][i]}
                {hasNotif && <span style={{ position:'absolute', top:-2, right:-2, width:8, height:8, borderRadius:'50%', background:'var(--accent)', border:'2px solid var(--bg2)' }}/>}
              </div>
              <span className={styles.bnavLbl}>{lang==='ja'?['タイマー','ルーム','フレンド','統計'][i]:['Timer','Room','Friends','Stats'][i]}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
