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
import TimelineCalendar from './TimelineCalendar'
import type { Profile, Room, RoomMember, Task, Friendship } from '@/lib/supabase/types'
import styles from './RoomClient.module.css'

type Props = {
  profile: Profile
  room: Room
  allRooms: Room[]
  initialMembers: (RoomMember & { profiles: { display_name: string; avatar_url: string | null } })[]
  initialFriends: (Friendship & { profiles: Profile })[]
  initialTasks: Task[]
  weeklyStats: { day_of_week: number; total_seconds: number }[]
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
  { id: 'lofi',   name: 'Lo-fi Hip Hop',    icon: '🎹', freqs: [220,277,330,370,440] as number[], noise: null as string | null },
  { id: 'rain',   name: '雨音 + カフェ',      icon: '🌧️', freqs: null, noise: 'rain' },
  { id: 'nature', name: '森の環境音',          icon: '🌿', freqs: null, noise: 'nature' },
  { id: 'cafe',   name: 'カフェの雑音',        icon: '☕', freqs: null, noise: 'cafe' },
  { id: 'piano',  name: 'ピアノ アンビエント', icon: '🎵', freqs: [261,329,392,523] as number[], noise: null },
]
const SEAT_COLORS = ['#6c8aff','#a78bfa','#34d399','#f59e0b','#f87171','#fbbf24','#60a5fa','#fb7185','#4ade80','#facc15']

export default function RoomClient({ profile, room, allRooms, initialMembers, initialFriends, initialTasks, weeklyStats }: Props) {
  const router = useRouter()
  const supabase = createClient()

  // ── Core hooks ──
  const timer = useTimer(() => {
    showToast('🍅 ポモドーロ完了！お疲れさまでした')
    addNotif('🍅', 'ポモドーロを完了しました！')
    saveStudySession()
    supabase.rpc('update_streak')
  })
  const [cameraOn, setCameraOn] = useState(false)
  const { localStream, remoteStreams } = useWebRTC(room.id, profile.id, cameraOn)
  const { members, updateStatus } = useRoomRealtime(room.id, profile.id)
  const displayMembers = members.length > 0 ? members : initialMembers
  const { friends, pendingIn, unreadCounts, blockUser, reportUser, acceptFriendRequest } = useFriends(profile.id)
  const displayFriends = friends.length > 0 ? friends : initialFriends
  const {
    dailyMessages, myMessage, reactions, showPinnedOnly, setShowPinnedOnly,
    mutualPinNotif, pinnedUserIds, REACTION_EMOJIS,
    sendReaction, togglePin, saveDailyMessage, isPinned, getReactionsFor,
  } = useInteractions(profile.id, room.id)

  // ── Stats ──
  const [todaySeconds, setTodaySeconds] = useState(profile.total_study_seconds ?? 0)
  const [pomosToday, setPomosToday] = useState(0)
  const [tasksDoneToday, setTasksDoneToday] = useState(0)
  const [streak, setStreak] = useState(profile.study_streak ?? 0)
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
  const [activeTab, setActiveTab] = useState<'stats' | 'bgm' | 'activity' | 'schedule'>('stats')
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
  const [awayEnabled, setAwayEnabled] = useState(true)
  const [awayMinutes, setAwayMinutes] = useState(5)
  const [onlineCount, setOnlineCount] = useState(247)
  const [currentTime, setCurrentTime] = useState('')
  const [quote, setQuote] = useState(QUOTES[0])
  const [showPinnedFilter, setShowPinnedFilter] = useState(false)

  // ── Refs ──
  const lastActivityRef = useRef(Date.now())
  const awayCountRef = useRef<NodeJS.Timeout | null>(null)
  const bgmCtxRef = useRef<AudioContext | null>(null)
  const bgmGainRef = useRef<GainNode | null>(null)
  const bgmNodesRef = useRef<AudioNode[]>([])
  const sessionStartRef = useRef(new Date().toISOString())

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
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    return () => events.forEach(e => window.removeEventListener(e, reset))
  }, [awayModal])
  useEffect(() => {
    const t = setInterval(() => {
      if (!timer.running || timer.mode !== 'focus') return
      if (awayEnabled && Date.now() - lastActivityRef.current >= awayMinutes * 60 * 1000 && !awayModal) triggerAway()
    }, 30_000)
    return () => clearInterval(t)
  }, [timer.running, timer.mode, awayModal, awayEnabled, awayMinutes])
  useEffect(() => {
    const t = setInterval(() => setOnlineCount(c => Math.max(200, c + Math.floor(Math.random() * 6 - 3))), 15_000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => { updateStatus(timer.mode === 'focus' ? 'studying' : 'break', currentTask, cameraOn) }, [cameraOn, timer.mode, currentTask])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  // Live study counter
  useEffect(() => {
    if (!timer.running || timer.mode !== 'focus') return
    const t = setInterval(() => setTodaySeconds(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [timer.running, timer.mode])

  // Fetch scheduled sessions
  useEffect(() => {
    fetchSessions()
  }, [room.id])

  // Fetch month stats
  useEffect(() => {
    if (statView === 'month') fetchMonthStats()
  }, [statView])

  async function fetchSessions() {
    const { data, error } = await supabase
      .from('scheduled_sessions')
      .select('id, title, scheduled_at, subject, host_id, duration_mins, room_id')
      .eq('host_id', profile.id)   // 自分が主催したセッション
      .gte('scheduled_at', new Date(Date.now() - 24*60*60*1000).toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(20)
    if (error) { console.error('fetchSessions error:', error); return }

    // Also fetch sessions user is a participant in
    const { data: myParticipations } = await supabase
      .from('session_participants')
      .select('session_id')
      .eq('user_id', profile.id)

    let allData = data || []
    if (myParticipations && myParticipations.length > 0) {
      const participatedIds = myParticipations.map(p => p.session_id)
      const { data: partSessions } = await supabase
        .from('scheduled_sessions')
        .select('id, title, scheduled_at, subject, host_id, duration_mins, room_id')
        .in('id', participatedIds)
        .gte('scheduled_at', new Date(Date.now() - 24*60*60*1000).toISOString())
        .order('scheduled_at', { ascending: true })
      if (partSessions) {
        // Merge and deduplicate
        const ids = new Set(allData.map(s => s.id))
        partSessions.forEach(s => { if (!ids.has(s.id)) allData.push(s) })
      }
    }
    allData.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

    if (allData) {
      // Fetch host names separately
      const hostIds = [...new Set(allData.map(s => s.host_id))]
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', hostIds.length > 0 ? hostIds : ['none'])
      const profileMap: Record<string, string> = {}
      profiles?.forEach(p => { profileMap[p.id] = p.display_name })
      setScheduledSessions(allData.map(s => ({
        ...s,
        profiles: { display_name: profileMap[s.host_id] || 'Unknown' }
      })))
    }
  }

  async function fetchMonthStats() {
    const start = new Date(); start.setDate(1); start.setHours(0,0,0,0)
    const { data } = await supabase
      .from('study_sessions')
      .select('started_at, duration_seconds')
      .eq('user_id', profile.id)
      .gte('started_at', start.toISOString())
    if (data) {
      const byDay: Record<number, number> = {}
      data.forEach(s => {
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

  async function addTask(title: string) {
    const { data } = await supabase.from('tasks').insert({ user_id: profile.id, title }).select().single()
    if (data) { setTasks(prev => [data, ...prev]); setCurrentTask(data.title) }
  }
  async function completeTask(task: Task) {
    await supabase.from('tasks').update({ completed: true, completed_at: new Date().toISOString() }).eq('id', task.id)
    setTasks(prev => prev.filter(t => t.id !== task.id))
    setTasksDoneToday(n => n + 1); addNotif('✅', `「${task.title}」を完了`)
  }
  async function deleteTask(taskId: string) {
    await supabase.from('tasks').delete().eq('id', taskId)
    setTasks(prev => prev.filter(t => t.id !== taskId))
  }
  async function saveStudySession() {
    await supabase.from('study_sessions').insert({
      user_id: profile.id, room_id: room.id,
      started_at: sessionStartRef.current, ended_at: new Date().toISOString(),
      duration_seconds: timer.customFocusMins * 60 || 25 * 60, pomodoros_completed: 1,
    })
    await supabase.from('profiles').update({ total_study_seconds: todaySeconds }).eq('id', profile.id)
    setPomosToday(p => p + 1); setStreak(s => s + 1)
    sessionStartRef.current = new Date().toISOString()
  }
  async function changeSubject(s: string) {
    setMySubject(s); setShowSubjectPicker(false)
    await supabase.rpc('update_subject', { p_subject: s })
    await supabase.from('room_members').update({ current_task: s }).eq('room_id', room.id).eq('user_id', profile.id)
    addNotif('🎯', `科目を「${s}」に設定しました`)
  }
  async function scheduleSession() {
    if (!schedTitle) { showToast('❌ タイトルを入力してください'); return }
    if (!schedDate) { showToast('❌ 日付を選択してください'); return }
    if (!schedTime) { showToast('❌ 時刻を選択してください'); return }
    const dt = new Date(`${schedDate}T${schedTime}`)

    // 専用プライベートルームを自動作成
    const inviteCode = Math.random().toString(36).slice(2, 10).toUpperCase()
    const { data: privateRoom } = await supabase.from('rooms').insert({
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
    const { data: session } = await supabase.from('scheduled_sessions').insert({
      host_id: profile.id,
      room_id: privateRoom.id,
      title: schedTitle,
      subject: mySubject || null,
      scheduled_at: dt.toISOString(),
      duration_mins: schedDuration,
    }).select().single()

    // ホスト自身を参加者に追加
    if (session) {
      await supabase.from('session_participants').insert({
        session_id: session.id, user_id: profile.id
      })
    }

    setShowScheduler(false); setSchedTitle(''); fetchSessions()
    addNotif('📅', `セッション「${schedTitle}」を予約しました`)
    showToast('📅 予約完了！参加者には招待リンクを共有してください')
  }
  async function joinSession(sessionId: string) {
    await supabase.from('session_participants').upsert(
      { session_id: sessionId, user_id: profile.id },
      { onConflict: 'session_id,user_id' }
    )
    fetchSessions()
    showToast('✅ 参加登録しました！開始時刻になると入室できます')
    addNotif('✋', 'セッションに参加登録しました')
  }

  // ── BGM ──
  async function initAudio() {
    if (!bgmCtxRef.current) {
      bgmCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      bgmGainRef.current = bgmCtxRef.current.createGain()
      bgmGainRef.current.gain.value = volume
      bgmGainRef.current.connect(bgmCtxRef.current.destination)
    }
    // Resume if suspended (browser blocks autoplay until user gesture)
    if (bgmCtxRef.current.state === 'suspended') {
      await bgmCtxRef.current.resume()
    }
  }
  function stopBgmNodes() { bgmNodesRef.current.forEach(n => { try { (n as OscillatorNode).stop?.(); n.disconnect() } catch {} }); bgmNodesRef.current = [] }
  async function playBgm(id: string) {
    await initAudio(); stopBgmNodes()
    const ctx = bgmCtxRef.current!; const gain = bgmGainRef.current!
    const track = BGM_TRACKS.find(t => t.id === id)!
    if (track.freqs) {
      track.freqs.forEach((f, i) => {
        const osc = ctx.createOscillator(); const g = ctx.createGain()
        osc.type = i % 2 === 0 ? 'sine' : 'triangle'; osc.frequency.value = f; g.gain.value = 0.07 / track.freqs!.length
        osc.connect(g); g.connect(gain); osc.start(); bgmNodesRef.current.push(osc, g)
      })
    } else {
      const buf = ctx.sampleRate * 2; const b = ctx.createBuffer(1, buf, ctx.sampleRate); const d = b.getChannelData(0)
      for (let i = 0; i < buf; i++) d[i] = (Math.random() * 2 - 1) * 0.3
      const src = ctx.createBufferSource(); src.buffer = b; src.loop = true
      const flt = ctx.createBiquadFilter()
      flt.type = track.noise === 'rain' ? 'highpass' : track.noise === 'nature' ? 'bandpass' : 'lowpass'
      flt.frequency.value = track.noise === 'rain' ? 700 : track.noise === 'nature' ? 350 : 500
      src.connect(flt); flt.connect(gain); src.start(); bgmNodesRef.current.push(src, flt)
    }
    setBgmPlaying(id); addNotif('🎵', `BGM「${track.name}」を再生中`)
  }
  function toggleBgm(id: string) { if (bgmPlaying === id) { stopBgmNodes(); setBgmPlaying(null) } else { playBgm(id) } }

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
    await sendMessage(chatInput.trim()); setChatInput('')
  }

  const fmtTime = (s: number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
  const fmtStudyTime = (s: number) => `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`
  const fmtScheduled = (dt: string) => {
    const d = new Date(dt)
    return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  }

  const weekDays = ['日','月','火','水','木','金','土']
  const weekDataMap: Record<number,number> = {}
  weeklyStats.forEach(d => { weekDataMap[d.day_of_week] = Number(d.total_seconds) })
  const maxWeek = Math.max(...Object.values(weekDataMap), 3600)
  const today = new Date().getDay()

  const chatFriend = displayFriends.find(f => f.addressee_id === chatFriendId)
  const chatFriendProfile = chatFriend?.profiles as Profile | undefined
  const friendsForTaskPanel = displayFriends.map(f => ({ id: f.addressee_id, display_name: (f.profiles as Profile).display_name, avatar_url: (f.profiles as Profile).avatar_url }))

  const filteredMembers = displayMembers.filter(m => m.user_id !== profile.id && (!showPinnedFilter || pinnedUserIds.includes(m.user_id)))
  const allSeats = 20
  const emptySeats = Math.max(0, allSeats - displayMembers.length)
  const seatRows = ['A','B','C','D','E']

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
              {['迷惑行為・荒らし','不適切なカメラ映像','スパム','その他'].map(reason => (
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
              {REACTION_EMOJIS.map(emoji => (
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
            <h3>🎯 勉強科目を選択</h3>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, margin:'16px 0' }}>
              {SUBJECTS.map(s => (
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
          <span>自習室 JP</span>
        </div>
        <div className={styles.headerCenter}>
          <div className={styles.onlineBadge}><span className={styles.liveDot}/>{onlineCount}人が勉強中</div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.clock}>{currentTime}</div>
          <div className={styles.avatarBtn}>
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" width={32} height={32} style={{ borderRadius:'50%', objectFit:'cover' }}/> : profile.display_name[0]}
          </div>
          <button className={styles.signOutBtn} onClick={() => signOut({ callbackUrl:'/' })}>ログアウト</button>
        </div>
      </header>

      {/* DESKTOP LAYOUT */}
      <div className={styles.desktopLayout}>

        {/* LEFT SIDEBAR */}
        <aside className={styles.sl}>
          <div className={styles.slScroll}>

            {/* Timer */}
            <div>
              <div className={styles.secLabel}>⏱ ポモドーロタイマー</div>
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
                <svg className={styles.timerRing} width="110" height="110" viewBox="0 0 110 110">
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
                  <div className={styles.timerLbl}>{timer.mode==='focus'?'集中モード':timer.mode==='short'?'小休憩':timer.mode==='long'?'長休憩':'カスタム'}</div>
                </div>
              </div>
              <div className={styles.timerCtrl}>
                <button className={styles.btnStart} onClick={timer.toggle}>{timer.running?'⏸ 一時停止':'▶ スタート'}</button>
                <button className={styles.btnReset} onClick={timer.reset}>↺</button>
              </div>
              <div className={styles.pomoDots}>
                {[0,1,2,3].map(i => <div key={i} className={`${styles.pdot} ${i<(timer.pomosCompleted%4)?styles.pdotDone:''}`}/>)}
              </div>
            </div>

            {/* Subject selector */}
            <div>
              <div className={styles.secLabel}>🎯 勉強科目</div>
              <button onClick={() => setShowSubjectPicker(true)} style={{ width:'100%', padding:'8px 12px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, color:mySubject?'var(--accent)':'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:'inherit', textAlign:'left', transition:'.2s' }}>
                {mySubject || '科目を選択...'} ▾
              </button>
            </div>

            {/* Tasks */}
            <div>
              <div className={styles.secLabel}>✅ タスク管理</div>
              <TaskPanel userId={profile.id} roomId={room.id} tasks={tasks}
                onAddTask={addTask} onCompleteTask={completeTask} onDeleteTask={deleteTask}
                friends={friendsForTaskPanel}/>
            </div>

            {/* Friends */}
            <div>
              <div className={styles.secLabel}>👥 フレンド</div>
              <div className={styles.friendList}>
                {displayFriends.map(f => {
                  const fp = f.profiles as Profile
                  const unread = unreadCounts[f.addressee_id] || 0
                  return (
                    <div key={f.id} className={styles.friendItem}>
                      <div className={styles.friendAvatar}>
                        {fp.avatar_url ? <img src={fp.avatar_url} alt="" width={30} height={30} style={{ borderRadius:'50%', objectFit:'cover' }}/> : fp.display_name[0]}
                        <div className={styles.friendDot}/>
                      </div>
                      <div className={styles.friendInfo}>
                        <div className={styles.friendName}>{fp.display_name}{unread>0&&<span className={styles.unreadBadge}>{unread}</span>}</div>
                        <div className={styles.friendMeta}>勉強中</div>
                      </div>
                      <div className={styles.friendActions}>
                        <button className={`${styles.faBtn} ${styles.faBtnChat}`} onClick={() => setChatFriendId(f.addressee_id)}>💬</button>
                        <button className={`${styles.faBtn} ${styles.faBtnBlock}`} onClick={() => setBlockModal({ userId:f.addressee_id, name:fp.display_name })}>🚫</button>
                      </div>
                    </div>
                  )
                })}
                {displayFriends.length===0&&<div style={{ fontSize:11, color:'var(--muted)', textAlign:'center', padding:'12px 0' }}>まだフレンドがいません</div>}
              </div>
            </div>

            {/* Away settings */}
            <div>
              <div className={styles.secLabel}>👁 離席検出</div>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--muted2)', cursor:'pointer' }}>
                  <input type="checkbox" checked={awayEnabled} onChange={e => setAwayEnabled(e.target.checked)} style={{ accentColor:'var(--accent)' }}/>
                  有効
                </label>
                {awayEnabled && (
                  <select value={awayMinutes} onChange={e => setAwayMinutes(Number(e.target.value))}
                    style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:6, color:'var(--muted2)', fontSize:11, padding:'3px 6px', cursor:'pointer' }}>
                    <option value={1}>1分</option><option value={3}>3分</option>
                    <option value={5}>5分</option><option value={10}>10分</option>
                  </select>
                )}
              </div>
            </div>

          </div>
        </aside>

        {/* MAIN */}
        <main className={styles.main}>

          {/* Camera bar */}
          <div className={styles.camCtrl}>
            <button className={`${styles.ctrlBtn} ${cameraOn?styles.ctrlBtnActive:''}`} onClick={() => setCameraOn(v => !v)}>
              📷 {cameraOn?'カメラON':'カメラOFF'}
            </button>
            <div className={styles.micBadge}>🔇 マイク禁止</div>
            <div className={styles.ctrlInfo}>トークは禁止。チャットでコミュニケーションを。</div>
            <button className={`${styles.ctrlBtn} ${styles.ctrlBtnDanger}`} onClick={async () => {
                // Leave room_members first
                const supa = createClient()
                await supa.from('room_members').delete().eq('room_id', room.id).eq('user_id', profile.id)
                router.push('/')
              }}>退室</button>
          </div>

          {/* Focus bar */}
          <div className={styles.focusBar}>
            <div>
              <div className={styles.focusLbl}>現在の集中タスク</div>
              <div className={styles.focusTask}>{currentTask}</div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {mySubject && <div style={{ padding:'3px 10px', background:'rgba(108,138,255,.1)', border:'1px solid rgba(108,138,255,.2)', borderRadius:12, fontSize:11, color:'var(--accent)' }}>{mySubject}</div>}
              <div className={styles.sessionBadge}>セッション {timer.sessionCount} / 4</div>
            </div>
          </div>

          {/* Daily message input */}
          <div style={{ display:'flex', gap:8 }}>
            <input placeholder="今日の一言を投稿..."
              value={dailyMsgInput} onChange={e => setDailyMsgInput(e.target.value)}
              onKeyDown={e => e.key==='Enter' && saveDailyMessage(dailyMsgInput)}
              style={{ flex:1, padding:'8px 12px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', fontSize:12, fontFamily:'inherit', outline:'none' }}/>
            <button onClick={() => { saveDailyMessage(dailyMsgInput); setDailyMsgInput('') }}
              style={{ padding:'8px 14px', background:'var(--accent)', border:'none', borderRadius:8, color:'#fff', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>投稿</button>
          </div>

          {/* Classroom */}
          <div>
            {/* Blackboard */}
            <div style={{ background:'#0a2a1a', border:'2px solid #1a4a2a', borderRadius:10, padding:'10px 20px', textAlign:'center', marginBottom:16 }}>
              <div style={{ color:'#34d399', fontSize:13, opacity:.85 }}>📚 {room.name} — 集中して頑張ろう！</div>
              <div style={{ display:'flex', justifyContent:'center', gap:20, fontSize:10, color:'#1a5a3a', marginTop:4 }}>
                <span>勉強中 {displayMembers.filter(m=>m.status==='studying').length}人</span>
                <span>休憩中 {displayMembers.filter(m=>m.status==='break').length}人</span>
                <span>席外 {displayMembers.filter(m=>m.status==='away').length}人</span>
                <span>空席 {emptySeats}席</span>
              </div>
            </div>

            {/* Controls */}
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <div className={styles.secLabel} style={{ marginBottom:0 }}>🎓 自習ルーム ({displayMembers.length}人)</div>
              <button onClick={() => setShowPinnedFilter(v => !v)}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', background:showPinnedFilter?'rgba(108,138,255,.15)':'var(--bg3)', border:`1px solid ${showPinnedFilter?'var(--accent)':'var(--border)'}`, borderRadius:6, color:showPinnedFilter?'var(--accent)':'var(--muted)', fontSize:11, cursor:'pointer', fontFamily:'inherit', transition:'.2s' }}>
                📌 {showPinnedFilter?'ピンのみ表示':'ピンのみ'}
              </button>
            </div>

            {/* Seat grid */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:12 }}>

              {/* My seat */}
              <div style={{ background:'var(--bg2)', border:'2px solid var(--accent)', borderRadius:12, padding:'8px', position:'relative' }}>
                <div style={{ position:'absolute', top:5, left:7, fontSize:9, color:'#3a4060', fontWeight:600 }}>A1</div>
                <div style={{ background:'#080a0f', borderRadius:8, aspectRatio:'4/3', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:6, position:'relative', overflow:'hidden' }}>
                  {localStream
                    ? <video style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:8, background:'#000' }} ref={v => { if (v && v.srcObject !== localStream) v.srcObject = localStream }} autoPlay muted playsInline/>
                    : <div style={{ width:52, height:52, borderRadius:'50%', background:'rgba(108,138,255,.2)', color:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:700 }}>
                        {profile.avatar_url ? <img src={profile.avatar_url} alt="" width={52} height={52} style={{ borderRadius:'50%' }}/> : profile.display_name[0]}
                      </div>}
                  {streak > 0 && <div style={{ position:'absolute', top:3, right:3, fontSize:9, color:'#f59e0b' }}>🔥{streak}</div>}
                </div>
                <div style={{ fontSize:12, color:'var(--accent)', textAlign:'center', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{profile.display_name}</div>
                <div style={{ display:'flex', justifyContent:'center', gap:4, marginTop:4 }}>
                  <button title="自分をピン（ピンフィルターに含める）"
                    onClick={() => setShowPinnedFilter(false)}
                    style={{ background:'transparent', border:'none', cursor:'pointer', fontSize:11, opacity:.7 }}
                    title="あなたはピンリストに常に表示されます">📌自</button>
                </div>
                {mySubject && <div style={{ textAlign:'center' }}><span style={{ display:'inline-block', padding:'1px 5px', borderRadius:3, fontSize:8, fontWeight:600, background:'rgba(108,138,255,.15)', color:'var(--accent)', marginTop:2 }}>{mySubject}</span></div>}
                {(() => { const dm = dailyMessages.find(d => d.user_id === profile.id); return dm ? <div style={{ background:'#0a1520', borderLeft:'2px solid var(--accent)', borderRadius:'0 4px 4px 0', padding:'2px 5px', fontSize:8, color:'#64748b', marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{dm.content}</div> : null })()}
              </div>

              {/* Other members */}
              {(showPinnedFilter ? displayMembers.filter(m => m.user_id !== profile.id && pinnedUserIds.includes(m.user_id)) : displayMembers.filter(m => m.user_id !== profile.id))
                .map((m, idx) => {
                  const rs = remoteStreams.get(m.user_id)
                  const mp = m.profiles as { display_name: string; avatar_url: string | null }
                  const isAway = m.status === 'away'
                  const isPinnedUser = isPinned(m.user_id)
                  const color = SEAT_COLORS[(idx + 1) % SEAT_COLORS.length]
                  const seatNum = `${seatRows[Math.floor((idx + 1) / 4)]}${(idx + 1) % 4 + 1}`
                  const rxs = getReactionsFor(m.user_id)
                  const dm = dailyMessages.find(d => d.user_id === m.user_id)
                  const memberSubject = m.current_task
                  return (
                    <div key={m.id} style={{ background:'var(--bg2)', border:`1px solid ${isPinnedUser?'#a78bfa':isAway?'#f59e0b':'var(--border)'}`, borderRadius:12, padding:'10px 8px', position:'relative', cursor:'default', transition:'.2s' }}
                      className={styles.seatCard}>
                      <div style={{ position:'absolute', top:5, left:7, fontSize:9, color:'#3a4060', fontWeight:600 }}>{seatNum}</div>
                      {isPinnedUser && <div style={{ position:'absolute', top:4, right:4, fontSize:10 }}>📌</div>}
                      {isAway && <div style={{ position:'absolute', top:6, left:'50%', transform:'translateX(-50%)', background:'rgba(245,158,11,.9)', borderRadius:4, padding:'2px 6px', fontSize:8, fontWeight:700, color:'#000', whiteSpace:'nowrap', zIndex:2 }}>😴 席外</div>}
                      {rxs.length > 0 && <div style={{ position:'absolute', top:-8, right:6, display:'flex', gap:1 }}>{rxs.slice(-2).map((r,i) => <span key={i} style={{ fontSize:12 }}>{r.emoji}</span>)}</div>}
                      <div style={{ background:'#080a0f', borderRadius:8, aspectRatio:'4/3', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:6, position:'relative', overflow:'hidden' }}>
                        {rs
                          ? <video style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:8, background:'#000' }} ref={v => { if (v && v.srcObject !== rs) v.srcObject = rs }} autoPlay playsInline/>
                          : <div style={{ width:52, height:52, borderRadius:'50%', background:`${color}22`, color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:700, overflow:'hidden' }}>
                              {mp.avatar_url ? <img src={mp.avatar_url} alt="" width={52} height={52} style={{ borderRadius:'50%' }}/> : mp.display_name[0]}
                            </div>}
                      </div>
                      <div style={{ fontSize:12, color:'var(--muted2)', textAlign:'center', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{mp.display_name}</div>
                      {memberSubject && <div style={{ textAlign:'center' }}><span style={{ display:'inline-block', padding:'1px 5px', borderRadius:3, fontSize:8, fontWeight:600, background:`${color}22`, color, marginTop:2 }}>{memberSubject}</span></div>}
                      {dm && <div style={{ background:'#0a1520', borderLeft:`2px solid ${color}`, borderRadius:'0 4px 4px 0', padding:'2px 5px', fontSize:8, color:'#64748b', marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{dm.content}</div>}
                      <div className={styles.seatActions}>
                        <button title="リアクション" onClick={() => setReactionTarget({ userId:m.user_id, name:mp.display_name })} style={{ background:'transparent', border:'none', cursor:'pointer', fontSize:11 }}>😊</button>
                        <button title={isPinnedUser?'ピン解除':'ピン留め'} onClick={() => togglePin(m.user_id)} style={{ background:'transparent', border:'none', cursor:'pointer', fontSize:11, opacity:isPinnedUser?1:.5 }}>📌</button>
                        <button title="報告" onClick={() => setReportModal({ userId:m.user_id, name:mp.display_name })} style={{ background:'transparent', border:'none', cursor:'pointer', fontSize:11 }}>⚠️</button>
                      </div>
                    </div>
                  )
                })}

              {/* Empty seats */}
              {!showPinnedFilter && Array.from({ length: Math.min(emptySeats, 8 - displayMembers.length) }).map((_, i) => {
                const idx = displayMembers.length + i
                const seatNum = `${seatRows[Math.floor(idx / 4)]}${idx % 4 + 1}`
                return (
                  <div key={`empty-${i}`} style={{ background:'var(--bg)', border:'1px dashed #1a1d24', borderRadius:12, padding:'10px 8px', opacity:.4 }}>
                    <div style={{ fontSize:9, color:'#3a4060', fontWeight:600, marginBottom:6 }}>{seatNum}</div>
                    <div style={{ background:'#0d0f16', borderRadius:8, height:52, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:6 }}>
                      <span style={{ color:'#2a2e3d', fontSize:20 }}>+</span>
                    </div>
                    <div style={{ fontSize:10, color:'#2a2e3d', textAlign:'center' }}>空席</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Rooms */}
          <div>
            <div className={styles.secLabel} style={{ marginBottom:10 }}>🏠 ルーム一覧</div>
            <div className={styles.roomsGrid}>
              {allRooms.map(r => (
                <div key={r.id} className={`${styles.roomCard} ${r.id===room.id?styles.roomCardActive:''}`} onClick={() => router.push(`/room/${r.id}`)}>
                  <div className={styles.roomName}>{r.emoji} {r.name}</div>
                  <div className={styles.roomDesc}>{r.description}</div>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* RIGHT SIDEBAR */}
        <aside className={styles.sr}>
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
                {chatMessages.map(msg => (
                  <div key={msg.id} className={`${styles.msg} ${msg.sender_id===profile.id?styles.msgMe:styles.msgThem}`}>
                    <div className={styles.msgBubble}>{msg.content}</div>
                    <div className={styles.msgTime}>{new Date(msg.created_at).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}</div>
                  </div>
                ))}
                <div ref={chatEndRef}/>
              </div>
              <div className={styles.chatInputRow}>
                <input className={styles.chatInput} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key==='Enter'&&handleSendMsg()} placeholder="メッセージ..."/>
                <button className={styles.chatSend} onClick={handleSendMsg}>送信</button>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.srTabs}>
                {(['stats','bgm','activity','schedule'] as const).map((tab,i) => (
                  <button key={tab} className={`${styles.srTab} ${activeTab===tab?styles.srTabActive:''}`} onClick={() => setActiveTab(tab)}>
                    {['📊','🎵','🔔','📅'][i]}
                  </button>
                ))}
              </div>
              <div className={styles.srPanel}>

                {activeTab==='stats' && (
                  <>
                    <div>
                      <div className={styles.secLabel}>本日</div>
                      <div className={styles.statCards}>
                        <div className={styles.statCard}><div className={styles.statVal}>{fmtStudyTime(todaySeconds)}</div><div className={styles.statSub}>合計勉強時間</div></div>
                        <div className={styles.statCard}><div className={styles.statVal}>{pomosToday}</div><div className={styles.statSub}>ポモドーロ</div></div>
                        <div className={styles.statCard}><div className={styles.statVal}>{streak}🔥</div><div className={styles.statSub}>連続日数</div></div>
                        <div className={styles.statCard}><div className={styles.statVal}>{tasksDoneToday}</div><div className={styles.statSub}>タスク完了</div></div>
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
                          {monthStats.map(d => {
                            const max = Math.max(...monthStats.map(s => s.total_seconds), 3600)
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
                      <div className={styles.secLabel}>今日の言葉</div>
                      <div className={styles.quoteBox}>「{quote.text}」<div className={styles.quoteAuthor}>— {quote.author}</div></div>
                    </div>
                  </>
                )}

                {activeTab==='bgm' && (
                  <>
                    <div className={styles.bgmList}>
                      {BGM_TRACKS.map(t => (
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

                {activeTab==='activity' && (
                  <div className={styles.notifList}>
                    {notifications.map((n,i) => (
                      <div key={i} className={styles.notifItem}>
                        <span>{n.icon}</span>
                        <div><div style={{ fontSize:11 }}>{n.text}</div><div style={{ fontSize:9, color:'var(--muted)', marginTop:2 }}>{n.time}</div></div>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab==='schedule' && (
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
                        const { data: sess } = await supabase
                          .from('scheduled_sessions')
                          .select('room_id')
                          .eq('id', s.id)
                          .single()
                        if (sess?.room_id) {
                          await supabase.from('session_participants').upsert(
                            { session_id: s.id, user_id: profile.id },
                            { onConflict: 'session_id,user_id' }
                          )
                          router.push('/room/' + sess.room_id)
                        }
                      }}
                    />
                    {scheduledSessions.length===0 ? (
                      <div style={{ fontSize:12, color:'var(--muted)', textAlign:'center', padding:'20px 0' }}>予約中のセッションはありません</div>
                    ) : scheduledSessions.map(s => {
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
                                const { data: sess } = await supabase
                                  .from('scheduled_sessions')
                                  .select('room_id')
                                  .eq('id', s.id)
                                  .single()
                                if (sess?.room_id) {
                                  // Join as participant first
                                  await supabase.from('session_participants').upsert(
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
                                await supabase.from('scheduled_sessions').delete().eq('id', s.id)
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
            {chatMessages.map(msg => (
              <div key={msg.id} className={`${styles.msg} ${msg.sender_id===profile.id?styles.msgMe:styles.msgThem}`}>
                <div className={styles.msgBubble}>{msg.content}</div>
                <div className={styles.msgTime}>{new Date(msg.created_at).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}</div>
              </div>
            ))}
            <div ref={chatEndRef}/>
          </div>
          <div className={styles.mobChatInputRow}>
            <input className={styles.chatInput} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key==='Enter'&&handleSendMsg()} placeholder="メッセージ..."/>
            <button className={styles.chatSend} onClick={handleSendMsg}>送信</button>
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
              <span className={styles.bnavLbl}>{['タイマー','ルーム','フレンド','統計'][i]}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
