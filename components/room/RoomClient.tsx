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
import ThemeToggle from '@/components/ThemeToggle'
import ProfileEditModal from '@/components/profile/ProfileEditModal'
import ProfileCard from '@/components/profile/ProfileCard'
import PinDialog from '@/components/room/PinDialog'
import { WORD_FILTERS } from '@/lib/wordFilter'
import AmbiencePanel from './AmbiencePanel'
import LibraryBackdrop from './LibraryBackdrop'
import ShareCard from './ShareCard'
import PushOptIn from '@/components/push/PushOptIn'
import { track, minutesBucket } from '@/lib/analytics'
import StudyTogether, { BlockedList, describeFriend, FriendPresence, ChatBubbleContent, InviteBanner, parseInvite } from './StudyTogether'
import { useAmbience } from '@/hooks/useAmbience'
import { Icon, PlayIcon, PauseIcon, type IconName } from './Icons'
import { usePresence, presenceRoomKey } from '@/hooks/usePresence'
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
  myPrivateRooms: Room[]
  roomOwner?: { id: string; display_name: string } | null
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
// チャットの話しかけヒント（まだやり取りが少ないときに出す。勉強の話題だけ）
const CHAT_HINTS_JA = ['ピンありがとう！何の勉強してる？', '一緒に25分やろう！', 'おつかれさま！今日は何時間やった？', '目標は何ですか？📚', '今日の目標は？一緒にやろう']
const CHAT_HINTS_EN = ['Thanks for the pin! What are you studying?', "Let's do 25 minutes together!", 'Nice work today!', "What's your goal?"]
// 映像を同時につなぐ最大人数（入室は何人でもできる）
const MAX_VIDEO_PEERS = 8
/** きょうのとなりの席：自分と相手の ID・日付（JST）から決まる数で、いちばん小さい人。日ごとに変わる */
function pickNeighbor(me: string, others: string[]): string | null {
  if (others.length === 0) return null
  const day = Math.floor((Date.now() + 9 * 3_600_000) / 86_400_000)
  const score = (id: string) => {
    const key = (me < id ? me + id : id + me) + day
    let h = 2166136261
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) }
    return h >>> 0
  }
  return others.reduce((best, id) => score(id) < score(best) ? id : best, others[0])
}

const SEAT_COLORS = ['var(--accent)','#a78bfa','#34d399','#f59e0b','#f87171','#fbbf24','#60a5fa','#fb7185','#4ade80','#facc15']
type PanelId = 'timer' | 'tasks' | 'music' | 'stats' | 'ranking' | 'friends' | 'schedule' | 'rooms' | 'activity' | 'safety'
const DOCK_PANELS: { id: PanelId; icon: IconName; ja: string; en: string }[] = [
  { id: 'timer',    icon: 'timer', ja: 'タイマー', en: 'Timer' },
  { id: 'tasks',    icon: 'tasks', ja: 'タスク',   en: 'Tasks' },
  { id: 'music',    icon: 'music', ja: 'サウンド', en: 'Sound' },
  { id: 'stats',    icon: 'stats', ja: '統計',     en: 'Stats' },
  { id: 'ranking',  icon: 'trophy', ja: 'ランキング', en: 'Ranking' },
  { id: 'friends',  icon: 'users', ja: 'フレンド', en: 'Friends' },
  { id: 'schedule', icon: 'calendar', ja: '予定',     en: 'Schedule' },
  { id: 'rooms',    icon: 'rooms', ja: 'ルーム',   en: 'Rooms' },
  { id: 'activity', icon: 'bell', ja: '通知',     en: 'Activity' },
  { id: 'safety',   icon: 'shield', ja: '安全設定', en: 'Safety' },
]

export default function RoomClient({ profile, room, allRooms, initialMembers, initialFriends, initialTasks, initialStats, myPrivateRooms = [], roomOwner = null }: Props) {
  const router = useRouter()
  const supabase = createClient()

  // ── Core hooks ──
  // ポモドーロ完了時：1 日 1 回だけ「今日の記録カード」を自動で開く（シェアのきっかけ）
  const [shareSignal, setShareSignal] = useState(0)
  const [ownerTipClosed, setOwnerTipClosed] = useState(false)
  const [pushCardClosed, setPushCardClosed] = useState(false)
  // 初めて部屋に入った・招待から入った、を計測（個人は特定しない）
  useEffect(() => {
    try { if (!localStorage.getItem('jr_first_room')) { localStorage.setItem('jr_first_room', '1'); track('first_room_enter') } } catch {}
    if (room.is_private && room.created_by !== profile.id) track('invite_accept')
  }, [])
  const timer = useTimer(() => {
    showToast(tr('🍅 ポモドーロ完了！お疲れさまでした', '🍅 Pomodoro done! Nice work'))
    addNotif('🍅', tr('ポモドーロを完了しました！', 'Completed a pomodoro!'))
    markPomodoro()
    track('pomodoro_complete')
    try {
      const key = 'shareCardShown:' + new Date().toISOString().slice(0, 10)
      if (!localStorage.getItem(key)) { localStorage.setItem(key, '1'); setShareSignal(Date.now()) }
    } catch {}
  })
  // ロビーの「今すぐはじめる」から来たら、タイマーを自動で開始する（?start=1）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('start') !== '1') return
    params.delete('start')
    window.history.replaceState(null, '', window.location.pathname + (params.toString() ? '?' + params : ''))
    if (!timer.running) timer.toggle()
    track('timer_start')
    showToast(tr('▶ タイマーを始めました。カメラは OFF のままで大丈夫です', '▶ Timer started. You can keep your camera off'))
  }, [])
  const [cameraOn, setCameraOn] = useState(false)

  // ── Face detection ──
  const faceVideoRef = useRef<HTMLVideoElement | null>(null)
  const [faceDetectEnabled, setFaceDetectEnabled] = useState(false)
  const [noFaceThreshold, setNoFaceThreshold] = useState(120) // 秒
  const { faceStatus, noFaceSeconds } = useFaceDetection(
    faceVideoRef,
    cameraOn && faceDetectEnabled,
    () => {
      showToast(T.faceWarning)
      addNotif('😴', tr('顔が検出されませんでした', 'No face detected'))
    },
    noFaceThreshold
  )
  const { members, updateStatus } = useRoomRealtime(room.id, profile.id)
  const rawMembers = members.length > 0 ? members : initialMembers
  const { friends, friendsLoaded, pendingIn, unreadCounts, blockUser, unblockUser, blocked, reportUser, acceptFriendRequest, declineFriendRequest, removeFriend, sendFriendRequest, newFriendRequest, setNewFriendRequest } = useFriends(profile.id)
  const blockedIds = new Set(blocked.map(b => b.id))
  const displayFriends = friendsLoaded ? friends : initialFriends
  const {
    dailyMessages, myMessage, reactions, showPinnedOnly, setShowPinnedOnly,
    mutualPinNotif, pinnedUserIds, matchedIds, getMyPin, pinFrom, REACTION_EMOJIS,
    sendReaction, togglePin, saveDailyMessage, isPinned, getReactionsFor,
  } = useInteractions(profile.id, room.id)
  // ピンの画面（理由・ひみつ）
  const [pinTarget, setPinTarget] = useState<{ userId: string; name: string } | null>(null)
  // ピンのボタン：いつも小さな画面を開く（ピンする・理由を変える・外すはその中で。ワンタップで外れないように）
  function onPinClick(userId: string, name: string) { setPinTarget({ userId, name }) }
  async function unpin(userId: string) {
    const r = await togglePin(userId)
    if (r.error) { showToast('❌ ' + r.error); return false }
    return true
  }

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
  const [, setProfileVersion] = useState(0)   // プロフィール保存後に再描画するため
  const [viewUserId, setViewUserId] = useState<string | null>(null)

  // ── Language ──
  const [lang, setLang] = useState<Lang>('ja')
  useEffect(() => {
    let saved: string | null = null
    try { saved = localStorage.getItem('lang') } catch {}
    if (saved === 'ja' || saved === 'en') setLang(saved)
  }, [])
  // 画面の言語をブラウザ・読み上げソフトにも伝える
  useEffect(() => { document.documentElement.lang = lang }, [lang])
  const T = translations[lang]
  // 日本語・英語の切り替え（翻訳辞書にない短い文言用）
  const tr = (ja: string, en: string) => (lang === 'ja' ? ja : en)
  const toggleLang = () => {
    const next: Lang = lang === 'ja' ? 'en' : 'ja'
    setLang(next)
    try { localStorage.setItem('lang', next) } catch {}
  }
  const [activeMobScreen, setActiveMobScreen] = useState<'timer' | 'room' | 'friends' | 'stats'>('room')
  const [notifications, setNotifications] = useState([{ icon: '🏠', text: `「${room.name}」`, at: Date.now() }])
  const [bgmPlaying, setBgmPlaying] = useState<string | null>(null)
  const ambience = useAmbience()
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
  const presence = usePresence(profile.id, room.id, isFocusing, !!room.is_private, room.invite_code)
  // フレンドの居場所表示用：自分が見られる部屋（公開ルーム＋入室権のあるプライベートルーム）
  // プライベートルームは presence 上ではハッシュなので、自分が入れる部屋のハッシュを計算して対応づける
  const [privateKeyMap, setPrivateKeyMap] = useState<[string, Room][]>([])
  useEffect(() => {
    let alive = true
    const list = [...myPrivateRooms, ...(room.is_private ? [room] : [])]
    Promise.all(list.map(async r => [await presenceRoomKey(r.id, true, r.invite_code), r] as [string, Room]))
      .then(pairs => { if (alive) setPrivateKeyMap(pairs) })
    return () => { alive = false }
  }, [room.id, myPrivateRooms.map(r => r.id).join(',')])
  const myRoomKey = privateKeyMap.find(([, r]) => r.id === room.id)?.[0] ?? room.id
  const roomsById = new Map<string, Room>([...allRooms.map(r => [r.id, r] as [string, Room]), ...privateKeyMap, [myRoomKey, room]])
  const friendStatus = (friendId: string) => describeFriend(friendId, presence.whereIs, roomsById, myRoomKey, lang)
  // フレンドからの招待（チャットで届いた部屋リンク）をお知らせ
  const [incomingInvite, setIncomingInvite] = useState<{ fromName: string; text: string; path: string } | null>(null)
  // Presence 同期後は、実際に接続している人だけを表示（閉じ忘れの幽霊メンバーを除外）
  const displayMembers = presence.synced
    ? rawMembers.filter((m: any) => presence.roomUserIds.has(m.user_id))
    : rawMembers
  // ブロックした相手は表示せず、カメラもつながない（DB 側でも通信を拒否している）
  const visibleMembers = displayMembers.filter((m: any) => !blockedIds.has(m.user_id))
  // きょうのとなりの席：二人の組み合わせと日付（JST）で決まる。毎日変わる
  const neighborId = pickNeighbor(profile.id, visibleMembers.map((m: any) => m.user_id).filter((id: string) => id !== profile.id))
  // 同じ目標の人（プロフィールの goal_exam）
  const [memberGoals, setMemberGoals] = useState<Record<string, string | null>>({})
  const memberIdsKey = visibleMembers.map((m: any) => m.user_id).sort().join(',')
  useEffect(() => {
    const ids = memberIdsKey.split(',').filter(id => id && !(id in memberGoals))
    if (ids.length === 0) return
    ;(supabase as any).from('profiles').select('id, goal_exam').in('id', ids.slice(0, 100))
      .then(({ data, error }: { data: { id: string; goal_exam: string | null }[] | null; error: unknown }) => {
        if (error || !data) return
        setMemberGoals(prev => ({ ...prev, ...Object.fromEntries(data.map(d => [d.id, d.goal_exam])) }))
      })
  }, [memberIdsKey])
  const myGoal = memberGoals[profile.id] ?? (profile as any).goal_exam ?? null
  /** 並び順：ペア（マッチ）→ となりの席 → ピン → フレンド → カメラ ON → 入室順 */
  const seatRank = (m: any) => matchedIds.has(m.user_id) ? 0 : m.user_id === neighborId ? 1 : isPinned(m.user_id) ? 2
    : displayFriends.some((f: any) => f.addressee_id === m.user_id) ? 3 : m.camera_on ? 4 : 5
  const orderedMembers = [...visibleMembers].sort((a: any, b: any) => seatRank(a) - seatRank(b))
  // 自分から映像をつなぎにいくのは 8 人まで（何人でも入室できる。全員とつなぐと端末が重くなるため）
  // カメラ ON の人を先に（OFF の人で枠が埋まらないように）。相手からの接続は部屋の全員分受け入れる
  const otherMemberIds = orderedMembers.map((m: any) => m.user_id).filter((id: string) => id !== profile.id)
  // 自分がカメラ OFF のときは、カメラ ON の人にだけ（受信専用で）つなぎにいく
  const videoPeerIds = [...orderedMembers].filter((m: any) => m.user_id !== profile.id && (cameraOn || m.camera_on))
    .sort((a: any, b: any) => Number(!!b.camera_on) - Number(!!a.camera_on))
    .map((m: any) => m.user_id).slice(0, MAX_VIDEO_PEERS)
  const { localStream, remoteStreams, relayStatus } = useWebRTC(room.id, profile.id, cameraOn, otherMemberIds, videoPeerIds)
  useEffect(() => { updateStatus(timer.mode === 'short' || timer.mode === 'long' ? 'break' : 'studying', currentTask, cameraOn) }, [cameraOn, timer.mode, currentTask])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])
  const friendsRef = useRef(displayFriends)
  friendsRef.current = displayFriends
  useEffect(() => {
    const ch = (supabase as any).channel(`invites:${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${profile.id}` }, (payload: any) => {
        const inv = parseInvite(payload.new?.content ?? '')
        if (!inv || inv.path === `/room/${room.id}` || (room.invite_code && inv.path === `/invite/${room.invite_code}`)) return
        const f = friendsRef.current.find((x: any) => x.addressee_id === payload.new.sender_id)
        if (!f) return // フレンド以外からの招待は表示しない
        const fromName = (f.profiles as Profile | undefined)?.display_name ?? (lang==='ja'?'フレンド':'A friend')
        setIncomingInvite({ fromName, text: inv.text, path: inv.path })
        addNotif('📨', lang==='ja'?`${fromName}さんから招待が届きました`:`${fromName} invited you`)
      })
      .subscribe()
    return () => { (supabase as any).removeChannel(ch) }
  }, [profile.id, room.id])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // 開いているダイアログがあれば、まずそれを閉じる
      if (blockModal) setBlockModal(null)
      else if (reportModal) setReportModal(null)
      else if (reactionTarget) setReactionTarget(null)
      else if (showCustomTimer) setShowCustomTimer(false)
      else if (showScheduler) setShowScheduler(false)
      else if (viewUserId) setViewUserId(null)
      else if (zen) setZen(false)
      else if (chatFriendId) setChatFriendId(null)
      else setPanel(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zen, chatFriendId, blockModal, reportModal, reactionTarget, showCustomTimer, showScheduler, viewUserId])

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
    // 招待された部屋（入室権のあるプライベートルーム）の予約も表示する
    const accessibleRoomIds = myPrivateRooms.map(r => r.id)
    if (accessibleRoomIds.length > 0) {
      const { data: roomSessions } = await supa.from('scheduled_sessions')
        .select('id, title, scheduled_at, subject, host_id, duration_mins, room_id')
        .in('room_id', accessibleRoomIds)
        .gte('scheduled_at', new Date(Date.now() - 24*60*60*1000).toISOString())
      const ids = new Set(allData.map((s: any) => s.id))
      ;(roomSessions ?? []).forEach((s: any) => { if (!ids.has(s.id)) allData.push(s) })
    }
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
    addNotif('⚠️', tr('席を外していると検出されました', 'You seem to be away'))
    let cnt = 60
    awayCountRef.current = setInterval(() => {
      cnt--; setAwayCountdown(cnt)
      if (cnt <= 0) {
        clearInterval(awayCountRef.current!); setAwayModal(false)
        if (timer.running) timer.toggle()
        showToast(tr('⏸ 長時間席を外したためタイマーを停止しました', '⏸ Timer paused because you were away'))
      }
    }, 1000)
  }

  function dismissAway() {
    if (awayCountRef.current) clearInterval(awayCountRef.current)
    setAwayModal(false); updateStatus('studying', currentTask, cameraOn)
    lastActivityRef.current = Date.now(); showToast(tr('📚 おかえりなさい！', '📚 Welcome back!'))
  }

  function onProfileSaved(p: { display_name: string; avatar_url: string | null; bio?: string | null }) {
    Object.assign(profile, p)
    setProfileVersion(v => v + 1)
    showToast(lang==='ja'?'プロフィールを保存しました':'Profile saved')
  }

  async function requestFriend(userId: string, name: string) {
    // 相手からすでに申請が届いていれば、そのまま承認してフレンドになる
    const incoming = pendingIn.find((r: any) => r.requester_id === userId)
    if (incoming) {
      const ok = await acceptFriendRequest(incoming.id)
      showToast(ok ? (lang==='ja'?`✅ ${name}さんとフレンドになりました`:`✅ Now friends with ${name}`) : (lang==='ja'?'❌ 承認できませんでした':'❌ Could not accept'))
      return
    }
    const result = await sendFriendRequest(userId)
    if (result === 'sent') {
      showToast(lang==='ja'?`👋 ${name}さんにフレンド申請しました！`:`👋 Friend request sent to ${name}!`)
      addNotif('👋', lang==='ja'?`${name}さんにフレンド申請しました`:`Friend request sent to ${name}`)
    } else if (result === 'accepted') {
      showToast(lang==='ja'?'すでにフレンドです':'Already friends')
    } else if (result === 'pending') {
      showToast(lang==='ja'?'申請済みです。相手の承認を待っています':'Request already sent')
    } else {
      showToast(lang==='ja'?'❌ 申請できませんでした（時間をおいて試してください）':'❌ Could not send request')
    }
  }
  async function acceptRequest(friendshipId: string, name: string) {
    const ok = await acceptFriendRequest(friendshipId)
    showToast(ok ? (lang==='ja'?`✅ ${name}さんとフレンドになりました`:`✅ Now friends with ${name}`) : (lang==='ja'?'❌ 承認できませんでした':'❌ Could not accept'))
  }
  async function declineRequest(friendshipId: string) {
    const ok = await declineFriendRequest(friendshipId)
    showToast(ok ? (lang==='ja'?'申請を見送りました（相手には通知されません）':'Request declined') : (lang==='ja'?'❌ 操作できませんでした':'❌ Failed'))
  }
  async function unfriend(userId: string, name: string) {
    if (!window.confirm(lang==='ja'?`${name}さんとのフレンドを解除しますか？（相手には通知されません）`:`Remove ${name} from friends?`)) return
    const ok = await removeFriend(userId)
    if (ok && chatFriendId === userId) setChatFriendId(null)
    showToast(ok ? (lang==='ja'?`${name}さんとのフレンドを解除しました`:`Removed ${name}`) : (lang==='ja'?'❌ 解除できませんでした':'❌ Failed'))
  }

  async function inviteFriend(friendId: string, name: string) {
    const res = await fetch('/api/room/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId: room.id, friendId }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { showToast('❌ ' + (data.error ?? (lang==='ja'?'招待を送れませんでした':'Could not send invite'))); throw new Error('invite failed') }
    showToast(lang==='ja'?`📨 ${name}さんを招待しました`:`📨 Invited ${name}`)
    addNotif('📨', lang==='ja'?`${name}さんを「${room.name}」に招待しました`:`Invited ${name} to "${room.name}"`)
  }
  async function askInvite(friendId: string, name: string) {
    const { error } = await (supabase as any).from('messages').insert({
      sender_id: profile.id, receiver_id: friendId,
      content: lang==='ja' ? '🙋 一緒に勉強したいです！今いる部屋に招待してもらえますか？' : '🙋 Can I join you? Please invite me to your room!',
    })
    if (error) { showToast(lang==='ja'?'❌ 送れませんでした':'❌ Could not send'); throw error }
    showToast(lang==='ja'?`🙋 ${name}さんにお願いを送りました`:`🙋 Asked ${name}`)
  }
  function joinFriendRoom(roomId: string) { router.push(`/room/${roomId}`) }

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
    setTasksDoneToday(n => n + 1); addNotif('✅', tr(`「${task.title}」を完了`, `Completed "${task.title}"`))
  }
  async function deleteTask(taskId: string) {
    await (supabase as any).from('tasks').delete().eq('id', taskId)
    setTasks(prev => prev.filter((t: any) => t.id !== taskId))
  }
  async function changeSubject(s: string) {
    setMySubject(s); setShowSubjectPicker(false)
    await (supabase as any).rpc('update_subject', { p_subject: s })
    await (supabase as any).from('room_members').update({ current_task: s }).eq('room_id', room.id).eq('user_id', profile.id)
    addNotif('🎯', tr(`科目を「${s}」に設定しました`, `Subject set to "${s}"`))
  }
  async function scheduleSession() {
    if (!schedTitle) { showToast(tr('❌ タイトルを入力してください', '❌ Enter a title')); return }
    if (!schedDate) { showToast(tr('❌ 日付を選択してください', '❌ Choose a date')); return }
    if (!schedTime) { showToast(tr('❌ 時刻を選択してください', '❌ Choose a time')); return }
    // 勉強会はこの部屋で開く（新しい部屋は作らない）。くり返し・招待はロビーの「フレンドと勉強会」から
    const res = await fetch('/api/study-group', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: schedTitle, date: schedDate, time: schedTime, durationMins: schedDuration, repeatDays: [], roomId: room.id }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      showToast('❌ ' + (data.error ?? tr('予約できませんでした', 'Could not schedule')))
      if (data.upgrade) router.push('/premium')
      return
    }
    setShowScheduler(false); setSchedTitle(''); fetchSessions()
    addNotif('📅', tr(`勉強会「${schedTitle}」を予約しました`, `Scheduled "${schedTitle}"`))
    showToast(tr('📅 予約しました！友達の招待やくり返しはロビーの「フレンドと勉強会」からできます', '📅 Scheduled! Invite friends from the lobby'))
  }
  async function copySessionInvite(code: string) {
    const url = `${window.location.origin}/invite/${code}`
    try { await navigator.clipboard.writeText(url); return true } catch { return false }
  }
  async function copySessionInviteByRoom(roomId: string) {
    const { data } = await (supabase as any).from('rooms').select('invite_code').eq('id', roomId).maybeSingle()
    if (!data?.invite_code) { showToast(tr('❌ 招待リンクを取得できませんでした', '❌ Could not get the invite link')); return }
    if (await copySessionInvite(data.invite_code)) showToast(tr('🔗 招待リンクをコピーしました', '🔗 Invite link copied'))
    else window.prompt(tr('このリンクをコピーしてください', 'Copy this link'), `${window.location.origin}/invite/${data.invite_code}`)
  }
  /** 勉強会に参加（サーバーが招待・入室権を確かめる）。成功したら true */
  async function joinSessionApi(sessionId: string): Promise<boolean> {
    const res = await fetch('/api/study-group', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, action: 'join' }) })
    if (res.ok) return true
    const d = await res.json().catch(() => ({}))
    showToast('❌ ' + (d.error ?? tr('参加できませんでした', 'Could not join')))
    return false
  }
  async function joinSession(sessionId: string) {
    if (!(await joinSessionApi(sessionId))) return
    fetchSessions()
    showToast(tr('✅ 参加登録しました！開始時刻になると入室できます', '✅ Registered! You can enter when it starts'))
    addNotif('✋', tr('勉強会に参加登録しました', 'Registered for a study group'))
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
    if (!started) { showToast(tr('🔇 音声を開始できませんでした。もう一度クリックしてください', '🔇 Could not start audio. Click again')); return }
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
    setBgmPlaying(id); addNotif('🎵', tr(`BGM「${(track as any).name}」を再生中`, `Playing "${(track as any).name}"`))
  }
  function toggleBgm(id: string) { if (bgmPlaying === id) { stopBgmNodes(); setBgmPlaying(null) } else { playBgm(id) } }

  function togglePanel(id: PanelId) { setChatFriendId(null); setPanel(p => p === id ? null : id) }
  function openChat(friendId: string) { setPanel('friends'); setChatFriendId(friendId) }
  async function leaveRoom() {
    track('session_end', { minutes_bucket: minutesBucket(Math.floor(todaySeconds / 60)) })
    // タイマーが動いている間は、押し間違いで退室しないよう確認する
    if (timer.running && !window.confirm(lang==='ja'?'タイマーが動いています。退室しますか？':'The timer is running. Leave the room?')) return
    await fetch('/api/room/leave', { method: 'POST', body: JSON.stringify({ roomId: room.id }) }).catch(() => {})
    router.push('/lobby')
  }

  function addNotif(icon: string, text: string) { setNotifications(prev => [{ icon, text, at: Date.now() }, ...prev].slice(0, 20)) }
  // 「3分前」のような相対時刻（currentTime が毎分変わるので自動で更新される）
  const ago = (at: number) => {
    const m = Math.floor((Date.now() - at) / 60000)
    if (m < 1) return lang==='ja' ? 'たった今' : 'just now'
    if (m < 60) return lang==='ja' ? `${m}分前` : `${m}m ago`
    const h = Math.floor(m / 60)
    return lang==='ja' ? `${h}時間前` : `${h}h ago`
  }
  const notificationsView = notifications.map(n => ({ ...n, time: ago(n.at) }))
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000) }
  async function handleBlock(userId: string, name: string) {
    const ok = await blockUser(userId); setBlockModal(null)
    if (!ok) { showToast(lang==='ja'?'❌ ブロックできませんでした':'❌ Could not block'); return }
    if (chatFriendId === userId) setChatFriendId(null)
    if (viewUserId === userId) setViewUserId(null)
    addNotif('🚫', lang==='ja'?`「${name}」をブロックしました`:`Blocked ${name}`)
    showToast(lang==='ja'?`🚫 ${name}さんをブロックしました。お互いに表示・連絡できなくなります`:`🚫 Blocked ${name}`)
  }
  async function handleUnblock(userId: string, name: string) {
    if (!(await unblockUser(userId))) { showToast(lang==='ja'?'❌ 解除できませんでした':'❌ Could not unblock'); return }
    showToast(lang==='ja'?`${name}さんのブロックを解除しました`:`Unblocked ${name}`)
  }
  // 一緒に勉強しよう：フレンドならペア申請、まだならフレンド申請
  async function studyTogetherWith(userId: string, name: string) {
    const isFriendNow = displayFriends.some((f: any) => f.addressee_id === userId)
    if (!isFriendNow) { await requestFriend(userId, name); return }
    const { error } = await (supabase as any).rpc('request_study_pair', { partner_id: userId })
    if (error) { showToast(lang==='ja'?'❌ 申請できませんでした':'❌ Could not send'); return }
    await (supabase as any).from('messages').insert({
      sender_id: profile.id, receiver_id: userId,
      content: lang==='ja' ? '🤝 一緒に勉強しよう！タスクパネルの「一緒に勉強中」から承認してね' : '🤝 Let\'s study together! Accept it from the Tasks panel.',
    })
    showToast(lang==='ja'?`🤝 ${name}さんに一緒に勉強しよう申請を送りました`:`🤝 Sent a study-together request to ${name}`)
  }
  async function handleReport(userId: string, reason: string) {
    await reportUser(userId, reason); setReportModal(null); showToast(tr('📢 報告を送信しました', '📢 Report sent'))
  }
  async function handleSendMsg() {
    if (!chatInput.trim() || !chatFriendId) return
    const hasNG = WORD_FILTERS.some(w => chatInput.includes(w))
    if (hasNG) { showToast(T.badWord); return }
    const sent = await sendMessage(chatInput.trim())
    // 送れなかったときは入力を残して知らせる（フレンド解除・ブロック・送りすぎなど）
    if (!sent) { showToast(lang==='ja'?'❌ 送信できませんでした。少し待ってからもう一度お試しください':'❌ Message not sent'); return }
    setChatInput('')
  }

  const fmtTime = (s: number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
  const fmtStudyTime = (s: number) => `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`
  const fmtScheduled = (dt: string) => {
    const d = new Date(dt)
    return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  }

  const weekDays = lang==='ja' ? ['日','月','火','水','木','金','土'] : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const weekDataMap: Record<number,number> = {}
  weeklyStats.forEach((d: any) => { weekDataMap[d.day_of_week] = Number(d.total_seconds) })
  const maxWeek = Math.max(...Object.values(weekDataMap), 3600)
  const today = new Date().getDay()

  const chatFriend = displayFriends.find((f: any) => f.addressee_id === chatFriendId)
  const chatFriendProfile = chatFriend?.profiles as Profile | undefined
  const friendsForTaskPanel = displayFriends.map((f: any) => ({ id: f.addressee_id, display_name: (f.profiles as Profile).display_name, avatar_url: (f.profiles as Profile).avatar_url }))

  const filteredMembers = orderedMembers.filter((m: any) => m.user_id !== profile.id && (!showPinnedFilter || pinnedUserIds.includes(m.user_id)))
  const tileCount = filteredMembers.length + 1 + (!showPinnedFilter && filteredMembers.length < 3 ? 1 : 0)
  const gridCols = tileCount <= 1 ? 1 : tileCount <= 4 ? 2 : tileCount <= 9 ? 3 : 4
  const studyingCount = displayMembers.filter((m: any) => m.status === 'studying').length
  const myStatus: 'studying' | 'break' | 'away' = awayModal ? 'away' : timer.mode === 'short' || timer.mode === 'long' ? 'break' : 'studying'
  const statusLabel = (st: string) => st === 'studying' ? (lang==='ja'?'集中中':'Focusing') : st === 'break' ? (lang==='ja'?'休憩中':'Break') : (lang==='ja'?'離席中':'Away')
  const timerModeLabel = timer.mode==='focus'?tr('集中モード','Focus'):timer.mode==='short'?tr('小休憩','Short break'):timer.mode==='long'?tr('長休憩','Long break'):tr('カスタム','Custom')

  return (
    <div className={styles.root}>
      <LibraryBackdrop/>

      {/* AWAY MODAL */}
      {awayModal && (
        <div className={styles.awayModal}>
          <div className={styles.awayEmoji}>😴</div>
          <div className={styles.awayTitle}>{tr('席を外していますか？','Are you still there?')}</div>
          <div className={styles.awayMsg}>{tr('しばらく動きが検出されていません。','No activity detected for a while.')}<br/>{tr('勉強を続けていますか？','Are you still studying?')}</div>
          <div className={styles.awayCountdown}>{awayCountdown}</div>
          <button className={styles.awayBackBtn} onClick={dismissAway}>📚 {tr('戻りました！',"I'm back!")}</button>
        </div>
      )}

      {pinTarget && (
        <PinDialog name={pinTarget.name} lang={lang}
          initial={(() => { const p = getMyPin(pinTarget.userId); return p ? { reason: p.reason, secret: p.is_secret } : null })()}
          onClose={() => setPinTarget(null)}
          onUpgrade={() => router.push('/premium')}
          mutual={matchedIds.has(pinTarget.userId)}
          onRemove={async () => { if (await unpin(pinTarget.userId)) { setPinTarget(null); showToast(lang==='ja' ? `${pinTarget.name}さんのピンを外しました` : 'Unpinned') } }}
          onSubmit={async (v) => {
            const r = await togglePin(pinTarget.userId, { ...v, forceUpdate: true })
            if (r.error) return { error: r.error, upgrade: r.upgrade }
            setPinTarget(null)
            if (!r.mutual) showToast(v.secret
              ? (lang==='ja' ? '🤫 ひみつでピンしました。相手もピンしたら、二人に知らせます' : '🤫 Secret pin saved')
              : (lang==='ja' ? `📌 ${pinTarget.name}さんをピンしました` : `📌 Pinned ${pinTarget.name}`))
          }}/>
      )}

      {/* MUTUAL PIN NOTIFICATION */}
      {mutualPinNotif && (
        <div className={styles.toast} style={{ background:'rgba(125,149,255,.95)', borderColor:'var(--accent2)', fontWeight:600, bottom:60 }}>
          {mutualPinNotif}
        </div>
      )}
      {toast && <div className={styles.toast}>{toast}</div>}
      {cameraOn && relayStatus === 'unavailable' && (
        <div className={styles.relayNotice} role="status">
          🔒 {lang==='ja'
            ? 'あなたの IP アドレスを守るため、いまはカメラ映像を他の人に送っていません（中継サーバーの準備中）。自分の画面には表示されます。'
            : 'To protect your IP address, your camera is not being shared right now (relay unavailable).'}
        </div>
      )}
      {/* ポモドーロを終えたあとに「明日も通知する？」を出す（許可ダイアログはボタンを押したときだけ） */}
      {shareSignal > 0 && !pushCardClosed && (
        <div className={styles.pushWrap}><PushOptIn onDone={() => setPushCardClosed(true)} /></div>
      )}
      <ShareCard hideButton openSignal={shareSignal} lang={lang} displayName={profile.display_name} todaySeconds={todaySeconds} pomosToday={pomosToday} streak={streak} week={weeklyStats as any} onToast={showToast}/>
      {/* 招待で入った友達部屋：作った人とまだフレンドでなければ、フレンド申請を案内する */}
      {roomOwner && friendsLoaded && !ownerTipClosed
        && !displayFriends.some((f: any) => f.addressee_id === roomOwner.id)
        && !blockedIds.has(roomOwner.id) && (
        <div className={styles.ownerTip} role="status">
          <span>🤝 {lang==='ja' ? <><b>{roomOwner.display_name}</b>さんの部屋です。フレンドになると、勉強中かどうかが分かり、すぐ合流できます。</> : <>This is <b>{roomOwner.display_name}</b>'s room. Add them as a friend to see when they're studying.</>}</span>
          <span className={styles.ownerTipBtns}>
            <button onClick={() => setOwnerTipClosed(true)}>{lang==='ja'?'あとで':'Later'}</button>
            <button className={styles.ownerTipPrimary} onClick={() => { requestFriend(roomOwner.id, roomOwner.display_name); setOwnerTipClosed(true) }}>{lang==='ja'?'フレンド申請':'Add friend'}</button>
          </span>
        </div>
      )}
      {incomingInvite && <InviteBanner {...incomingInvite} lang={lang} onClose={() => setIncomingInvite(null)}/>}

      {/* Profile Edit Modal */}
      {showProfileEdit && (
        <ProfileEditModal profile={profile} lang={lang} onClose={() => setShowProfileEdit(false)} onSaved={onProfileSaved}/>
      )}

      {/* 他の人のプロフィール */}
      {viewUserId && (() => {
        const m = displayMembers.find(x => x.user_id === viewUserId)
        const name = (m?.profiles as any)?.display_name ?? ''
        const isFriend = displayFriends.some((f:any) => f.addressee_id === viewUserId)
        const isPending = pendingIn.some((p:any) => p.requester_id === viewUserId)
        const close = () => setViewUserId(null)
        return (
          <ProfileCard userId={viewUserId} lang={lang} onClose={close}>
            {isFriend
              ? <button onClick={() => { close(); openChat(viewUserId) }}><Icon name="message" size={14}/>{lang==='ja'?'メッセージ':'Message'}</button>
              : isPending
                ? <button disabled><Icon name="clock" size={14}/>{lang==='ja'?'申請が届いています':'Request pending'}</button>
                : <button onClick={() => requestFriend(viewUserId, name)}><Icon name="userPlus" size={14}/>{lang==='ja'?'フレンド申請':'Add friend'}</button>}
            {isFriend && <button onClick={() => { close(); unfriend(viewUserId, name) }}><Icon name="x" size={14}/>{lang==='ja'?'フレンド解除':'Unfriend'}</button>}
            {isFriend && <button onClick={() => studyTogetherWith(viewUserId, name)}><Icon name="users" size={14}/>{lang==='ja'?'一緒に勉強しよう':'Study together'}</button>}
            {isFriend && room.id && <button onClick={() => inviteFriend(viewUserId, name).catch(() => {})}><Icon name="rooms" size={14}/>{lang==='ja'?'この部屋に招待':'Invite here'}</button>}
            {m && <button onClick={() => { close(); onPinClick(viewUserId, name) }}><Icon name="pin" size={14}/>{matchedIds.has(viewUserId)?(lang==='ja'?'🤝 勉強仲間（ピンを編集）':'Buddy (edit pin)'):isPinned(viewUserId)?(lang==='ja'?'ピンを編集・外す':'Edit pin'):(lang==='ja'?'ピンする':'Pin')}</button>}
            <button onClick={() => { close(); setReportModal({ userId:viewUserId, name }) }}><Icon name="flag" size={14}/>{lang==='ja'?'報告':'Report'}</button>
            {blockedIds.has(viewUserId)
              ? <button onClick={() => handleUnblock(viewUserId, name)}><Icon name="x" size={14}/>{lang==='ja'?'ブロック解除':'Unblock'}</button>
              : <button onClick={() => { close(); setBlockModal({ userId:viewUserId, name }) }}><Icon name="x" size={14}/>{lang==='ja'?'ブロック':'Block'}</button>}
          </ProfileCard>
        )
      })()}

      {/* BLOCK MODAL */}
      {blockModal && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setBlockModal(null) }}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-label={tr('ブロック','Block')}>
            <h3>🚫 {lang==='ja'?'ユーザーをブロック':'Block user'}</h3>
            <p>{lang==='ja'
              ? `「${blockModal.name}」さんをブロックしますか？お互いのカメラ・メッセージ・フレンド申請が届かなくなり、フレンドも解除されます。あとからフレンド一覧の下で解除できます。`
              : `Block ${blockModal.name}? You won't see each other's camera, messages or friend requests.`}</p>
            <div className={styles.modalBtns}>
              <button className={`${styles.mBtn} ${styles.ghost}`} onClick={() => setBlockModal(null)}>{tr('キャンセル','Cancel')}</button>
              <button className={`${styles.mBtn} ${styles.danger}`} onClick={() => handleBlock(blockModal.userId, blockModal.name)}>{tr('ブロック','Block')}</button>
            </div>
          </div>
        </div>
      )}

      {/* REPORT MODAL */}
      {reportModal && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setReportModal(null) }}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-label={tr('報告','Report')}>
            <h3>📢 {tr('ユーザーを報告','Report user')}</h3>
            <p>{tr(`「${reportModal.name}」を報告する理由：`, `Why are you reporting ${reportModal.name}?`)}</p>
            <div className={styles.reportBtns}>
              {/* 理由は運営が読むので日本語のまま保存し、表示だけ切り替える */}
              {([['迷惑行為・荒らし','Harassment / trolling'],['不適切なカメラ映像','Inappropriate video'],['スパム','Spam'],['その他','Other']] as const).map(([reason, en]) => (
                <button key={reason} className={`${styles.mBtn} ${styles.ghost}`}
                  onClick={() => handleReport(reportModal.userId, reason)}>{tr(reason, en)}</button>
              ))}
            </div>
            <div className={styles.modalBtns}>
              <button className={`${styles.mBtn} ${styles.ghost}`} onClick={() => setReportModal(null)}>{tr('キャンセル','Cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* REACTION MODAL */}
      {reactionTarget && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setReactionTarget(null) }}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-label={tr('リアクション','Reaction')}>
            <h3>{tr('リアクションを送る','Send a reaction')}</h3>
            <p>{tr(`「${reactionTarget.name}」さんへ`, `To ${reactionTarget.name}`)}</p>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', justifyContent:'center', margin:'16px 0' }}>
              {REACTION_EMOJIS.map((emoji: any) => (
                <button key={emoji} style={{ fontSize:28, padding:'8px 12px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, cursor:'pointer' }}
                  onClick={async () => {
                    const result = await sendReaction(reactionTarget.userId, emoji)
                    if (result?.success) {
                      setReactionResult(`${emoji} ${tr('送りました！','Sent!')}`)
                      addNotif(emoji, tr(`「${reactionTarget.name}」さんにリアクションを送りました`, `Sent a reaction to ${reactionTarget.name}`))
                      setTimeout(() => { setReactionResult(null); setReactionTarget(null) }, 1500)
                    } else { setReactionResult(result?.error ?? tr('エラー','Error')); setTimeout(() => setReactionResult(null), 2000) }
                  }}>{emoji}</button>
              ))}
            </div>
            {reactionResult && <div style={{ textAlign:'center', color:'var(--accent3)', marginBottom:12 }}>{reactionResult}</div>}
            <div className={styles.modalBtns}>
              <button className={`${styles.mBtn} ${styles.ghost}`} onClick={() => { setReactionTarget(null); setReactionResult(null) }}>{tr('閉じる','Close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM TIMER MODAL */}
      {showCustomTimer && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowCustomTimer(false) }}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-label={tr('カスタムタイマー','Custom timer')}>
            <h3>⏱ {tr('カスタムタイマー設定','Custom timer')}</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:16, margin:'16px 0' }}>
              <div>
                <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:6 }}>{tr('集中時間（分）','Focus (min)')}</label>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <input type="range" min="5" max="120" step="5" value={customFocusInput}
                    onChange={e => setCustomFocusInput(Number(e.target.value))}
                    style={{ flex:1 }} />
                  <span style={{ fontFamily:'monospace', fontSize:18, color:'var(--accent)', minWidth:40 }}>{customFocusInput}{tr('分','m')}</span>
                </div>
              </div>
              <div>
                <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:6 }}>{tr('休憩時間（分）','Break (min)')}</label>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <input type="range" min="1" max="30" step="1" value={customBreakInput}
                    onChange={e => setCustomBreakInput(Number(e.target.value))}
                    style={{ flex:1 }} />
                  <span style={{ fontFamily:'monospace', fontSize:18, color:'var(--accent3)', minWidth:40 }}>{customBreakInput}{tr('分','m')}</span>
                </div>
              </div>
            </div>
            <div className={styles.modalBtns}>
              <button className={`${styles.mBtn} ${styles.ghost}`} onClick={() => setShowCustomTimer(false)}>{tr('キャンセル','Cancel')}</button>
              <button className={`${styles.mBtn} ${styles.primary}`}
                onClick={() => { timer.applyCustom(customFocusInput, customBreakInput); setShowCustomTimer(false); showToast(tr(`⏱ ${customFocusInput}分集中タイマーをセットしました`, `⏱ ${customFocusInput}-min focus timer set`)) }}>
                {tr('セット','Set')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SESSION SCHEDULER MODAL */}
      {showScheduler && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowScheduler(false) }}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-label={tr('予約','Schedule')}>
            <h3>📅 {tr('この部屋で勉強会を予約','Schedule a study group here')}</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:10, margin:'16px 0' }}>
              <input placeholder={tr('勉強会のタイトル（例：英語リスニング集中会）','Title (e.g. English listening)')}
                value={schedTitle} onChange={e => setSchedTitle(e.target.value)}
                style={{ padding:'8px 10px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:7, color:'var(--text)', fontSize:13, fontFamily:'inherit', outline:'none' }} />
              <div style={{ display:'flex', gap:8 }}>
                <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)}
                  style={{ flex:1, padding:'8px 10px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:7, color:'var(--text)', fontSize:13, fontFamily:'inherit', outline:'none' }} />
                <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)}
                  style={{ flex:1, padding:'8px 10px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:7, color:'var(--text)', fontSize:13, fontFamily:'inherit', outline:'none' }} />
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <label style={{ fontSize:12, color:'var(--muted)', whiteSpace:'nowrap' }}>{tr('時間：','Length:')}</label>
                <select value={schedDuration} onChange={e => setSchedDuration(Number(e.target.value))}
                  style={{ flex:1, padding:'8px 10px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:7, color:'var(--text)', fontSize:13, fontFamily:'inherit', outline:'none' }}>
                  <option value={30}>{tr('30分','30 min')}</option>
                  <option value={60}>{tr('1時間','1 hour')}</option>
                  <option value={90}>{tr('1時間30分','1.5 hours')}</option>
                  <option value={120}>{tr('2時間','2 hours')}</option>
                </select>
              </div>
            </div>
            <div className={styles.modalBtns}>
              <button className={`${styles.mBtn} ${styles.ghost}`} onClick={() => setShowScheduler(false)}>{tr('キャンセル','Cancel')}</button>
              <button className={`${styles.mBtn} ${styles.primary}`} onClick={scheduleSession}>{tr('予約する','Schedule')}</button>
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
                  style={{ padding:'6px 14px', borderRadius:20, border:`1px solid ${mySubject===s?'var(--accent)':'var(--border)'}`, background:mySubject===s?'rgba(125,149,255,.15)':'var(--bg3)', color:mySubject===s?'var(--accent)':'var(--muted2)', fontSize:13, cursor:'pointer', fontFamily:'inherit', transition:'.15s' }}
                  onClick={() => changeSubject(s)}>{s}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>自</div>
          <span>{lang==='ja'?'自習室 JP':'Study With Me JP'}</span>
        </div>
        <div className={styles.headerCenter}>
          <div className={styles.onlineBadge}><span className={styles.liveDot}/>{presence.studyingCount}{lang==='ja'?'人が勉強中':' studying now'} · {presence.onlineCount}{lang==='ja'?'人オンライン':' online'}</div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.clock}>{currentTime}</div>
          <ThemeToggle />
          <button onClick={toggleLang}
            style={{ minHeight:32, minWidth:40, padding:'4px 10px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:6, color:'var(--muted2)', fontSize:11, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>
            {lang === 'ja' ? 'EN' : '日本語'}
          </button>
          <div className={styles.avatarBtn} onClick={() => setShowProfileEdit(true)}
            style={{ cursor:'pointer' }} title={lang==='ja'?'プロフィールを編集':'Edit profile'}>
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" width={32} height={32} style={{ borderRadius:'50%', objectFit:'cover' }}/> : profile.display_name[0]}
          </div>
          <button className={styles.signOutBtn} onClick={() => signOut({ callbackUrl:'/' })}>{T.logout}</button>
        </div>
      </header>

      {/* DESKTOP LAYOUT — Study Stream style: video stage + dock + slide-in drawer */}
      <div className={styles.desktopLayout}>

        {/* STAGE */}
        <main className={`${styles.ssStage} ${panel || chatFriendId ? styles.ssStageShift : ''}`}>

          {/* Top row: room info / timer pill / current task */}
          <div className={styles.ssTopRow}>
            <button className={styles.ssRoomInfo} onClick={() => togglePanel('rooms')} title={lang==='ja'?'ルームを切り替え':'Switch room'}>
              <span className={styles.ssRoomEmoji}>{room.emoji ?? '📚'}</span>
              <div style={{ minWidth:0 }}>
                <div className={styles.ssRoomName}>{room.name} <Icon name="chevron" size={12}/></div>
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
                {timer.running ? <PauseIcon/> : <PlayIcon/>}
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
                      <div className={styles.ssAvatar} style={{ background:'rgba(125,149,255,.2)', color:'var(--accent)' }}>
                        {profile.avatar_url ? <img src={profile.avatar_url} alt=""/> : profile.display_name[0]}
                      </div>
                      <button className={styles.ssCamCta} onClick={() => setCameraOn(true)}><Icon name="camera" size={13}/> {lang==='ja'?'カメラをONにする':'Turn camera on'}</button>
                    </div>}
                <div className={styles.ssTileTop}>
                  <span className={`${styles.ssStatus} ${myStatus==='studying'?styles.ssStatusStudy:myStatus==='break'?styles.ssStatusBreak:styles.ssStatusAway}`}>
                    {statusLabel(myStatus)}
                  </span>
                  {streak > 0 && <span className={styles.ssChip}>{lang==='ja'?`${streak}日連続`:`${streak}-day streak`}</span>}
                </div>
                <div className={styles.ssTileBottom}>
                  <button className={styles.ssName} onClick={() => setShowProfileEdit(true)} title={lang==='ja'?'プロフィールを編集':'Edit profile'}>{profile.display_name} <span style={{ opacity:.6 }}>{lang==='ja'?'（自分）':'(you)'}</span></button>
                  {mySubject && <span className={styles.ssChip}>{mySubject}</span>}
                </div>
                {(() => { const dm = dailyMessages.find((d: any) => d.user_id === profile.id); return dm ? <div className={styles.ssBubble}>{dm.content}</div> : null })()}
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
                  <div key={m.id} className={`${styles.ssTile} ${isPinnedUser?styles.ssTilePinned:''} ${matchedIds.has(m.user_id)?styles.ssTilePair:''} ${m.user_id===neighborId?styles.ssTileSeat:''} ${m.status==='away'?styles.ssTileAway:''}`}>
                    {rs
                      ? <video className={styles.ssVideo} ref={v => { if (v && v.srcObject !== rs) v.srcObject = rs }} autoPlay playsInline/>
                      : <div className={styles.ssTileOff}>
                          <div className={styles.ssAvatar} style={{ background:`${color}22`, color, cursor:'pointer' }} onClick={() => setViewUserId(m.user_id)}>
                            {mp.avatar_url ? <img src={mp.avatar_url} alt=""/> : mp.display_name[0]}
                          </div>
                        </div>}
                    <div className={styles.ssTileTop}>
                      <span className={`${styles.ssStatus} ${m.status==='studying'?styles.ssStatusStudy:m.status==='break'?styles.ssStatusBreak:styles.ssStatusAway}`}>
                        {statusLabel(m.status)}
                      </span>
                      {(() => {
                        // 関係の印は 1 つだけ（多すぎると読めないので）：仲間 → きょうのとなり → 同じ目標 → あなたをピン → ピン中
                        if (matchedIds.has(m.user_id)) return <span className={`${styles.ssChip} ${styles.ssChipPair}`}>🤝 {lang==='ja'?'勉強仲間':'Buddy'}</span>
                        if (m.user_id === neighborId) return <span className={`${styles.ssChip} ${styles.ssChipSeat}`} title={lang==='ja'?'毎日ひとり、となりの席の人が選ばれます。今日はこの人と一緒にがんばろう':'A new neighbor is picked every day'}>🪑 {lang==='ja'?'きょうのとなり':'Your neighbor'}</span>
                        if (myGoal && memberGoals[m.user_id] === myGoal) return <span className={styles.ssChip}>🎯 {lang==='ja'?'同じ目標':'Same goal'}</span>
                        if (pinFrom(m.user_id)) return <span className={styles.ssChip} title={pinFrom(m.user_id)?.reason ?? ''}>📌 {lang==='ja'?'あなたをピン':'Pinned you'}</span>
                        return null
                      })()}
                      {!rs && m.camera_on && videoPeerIds.indexOf(m.user_id) === -1 && <span className={styles.ssChip}>{lang==='ja'?'映像は近くの席の8人まで':'Video: nearest 8'}</span>}
                      {rxs.length > 0 && <span className={styles.ssChip}>{rxs.slice(-3).map(r => r.emoji).join('')}</span>}
                    </div>
                    <div className={styles.ssTileActions}>
                      <button title={lang==='ja'?'リアクション':'React'} aria-label={lang==='ja'?'リアクション':'React'} onClick={() => setReactionTarget({ userId:m.user_id, name:mp.display_name })}><Icon name="smile" size={14}/></button>
                      {isFriend ? (
                        <button title={lang==='ja'?'チャット':'Chat'} aria-label={lang==='ja'?'チャット':'Chat'} onClick={() => openChat(m.user_id)}><Icon name="message" size={14}/></button>
                      ) : isPending ? (
                        <button title={lang==='ja'?'申請中':'Pending'} aria-label={lang==='ja'?'申請中':'Pending'} disabled><Icon name="clock" size={14}/></button>
                      ) : (
                        <button title={lang==='ja'?'一緒に勉強しよう（フレンド申請）':'Study together (add friend)'} aria-label={lang==='ja'?'一緒に勉強しよう（フレンド申請）':'Study together (add friend)'} onClick={() => requestFriend(m.user_id, mp.display_name)}><Icon name="userPlus" size={14}/></button>
                      )}
                      {isFriend && <button title={lang==='ja'?'となりで25分やろう（フレンドを誘う）':'Invite friend to study'} aria-label={lang==='ja'?'となりで25分やろう（フレンドを誘う）':'Invite friend to study'} onClick={() => studyTogetherWith(m.user_id, mp.display_name)}><Icon name="users" size={14}/></button>}
                      <button title={lang==='ja'?'報告':'Report'} aria-label={lang==='ja'?'報告':'Report'} onClick={() => setReportModal({ userId:m.user_id, name:mp.display_name })}><Icon name="flag" size={14}/></button>
                      <button title={lang==='ja'?'ブロック':'Block'} aria-label={lang==='ja'?'ブロック':'Block'} onClick={() => setBlockModal({ userId:m.user_id, name:mp.display_name })}><Icon name="x" size={14}/></button>
                    </div>
                    <div className={styles.ssTileBottom}>
                      <button className={styles.ssName} onClick={() => setViewUserId(m.user_id)} title={lang==='ja'?'プロフィールを見る':'View profile'}>{mp.display_name}</button>
                      {memberSubject && <span className={styles.ssChip} style={{ color }}>{memberSubject}</span>}
                      {(() => {
                        const matched = matchedIds.has(m.user_id)
                        const secretPin = !!getMyPin(m.user_id)?.is_secret
                        const label = matched ? (lang==='ja'?'🤝 勉強仲間':'🤝 Buddy')
                          : isPinnedUser ? (secretPin ? (lang==='ja'?'🤫 ひみつ':'🤫 Secret') : (lang==='ja'?'📌 ピン中':'📌 Pinned'))
                          : (lang==='ja'?'📌 ピン':'📌 Pin')
                        const hint = matched ? (lang==='ja'?`${mp.display_name}さんとは勉強仲間です（お互いにピン）`:'You pinned each other')
                          : isPinnedUser ? (lang==='ja'?`${mp.display_name}さんをピンしています。タップで理由の変更・解除`:'Pinned. Tap to edit')
                          : (lang==='ja'?`${mp.display_name}さんをピン。一緒にがんばりたい人をピンして、お互いにピンすると勉強仲間になれます`:'Pin to become study buddies')
                        return (
                          <button type="button" title={hint} aria-label={matched ? (lang==='ja'?`${mp.display_name}さんとは勉強仲間（ピンを編集）`:'Edit pin') : isPinnedUser ? (lang==='ja'?`${mp.display_name}さんのピンを編集`:'Edit pin') : (lang==='ja'?`${mp.display_name}さんをピン`:`Pin ${mp.display_name}`)} aria-pressed={isPinnedUser}
                            className={`${styles.ssPinBtn} ${isPinnedUser?styles.ssPinBtnOn:''} ${matched?styles.ssPinBtnPair:''}`}
                            onClick={() => onPinClick(m.user_id, mp.display_name)}>{label}</button>
                        )
                      })()}
                    </div>
                    {dm && <div className={styles.ssBubble}>{dm.content}</div>}
                  </div>
                )
              })}

              {/* Invite tile when the room is quiet */}
              {!showPinnedFilter && filteredMembers.length < 3 && (
                <div className={`${styles.ssTile} ${styles.ssTileEmpty}`}>
                  <div className={styles.ssTileOff}>
                    <div style={{ color:'var(--muted)' }}><Icon name="seat" size={26} strokeWidth={1.3}/></div>
                    <div style={{ fontSize:12, color:'var(--muted)' }}>{lang==='ja'?'もうすぐ誰かが来るかも…':'Someone may join soon…'}</div>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'center' }}>
                      <button className={styles.ssCamCta} onClick={() => togglePanel('friends')}>🤝 {lang==='ja'?'友達を呼ぶ':'Invite friends'}</button>
                      <button className={styles.ssCamCta} onClick={() => togglePanel('rooms')}>{lang==='ja'?'他のルームを見る':'Browse rooms'}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* DOCK */}
          <div className={styles.ssDock}>
            <button className={`${styles.ssDockBtn} ${cameraOn?styles.ssDockOn:styles.ssDockOff}`} onClick={() => setCameraOn(v => !v)} title={cameraOn?T.cameraOn:T.cameraOff}>
              <span className={styles.ssDockIcon}><Icon name={cameraOn?'camera':'cameraOff'}/></span>
              <span className={styles.ssDockLbl}>{cameraOn?(lang==='ja'?'カメラON':'Cam on'):(lang==='ja'?'カメラOFF':'Cam off')}</span>
            </button>
            <div className={`${styles.ssDockBtn} ${styles.ssDockOff}`} title={T.noTalk} style={{ cursor:'default' }}>
              <span className={styles.ssDockIcon}><Icon name="micOff"/></span>
              <span className={styles.ssDockLbl}>{lang==='ja'?'マイクなし':'No mic'}</span>
            </div>
            <div className={styles.ssDockSep}/>
            {DOCK_PANELS.map(p => {
              const badge = p.id === 'friends' ? pendingIn.length + Object.values(unreadCounts).reduce((a, b) => a + b, 0) : 0
              return (
                <button key={p.id} className={`${styles.ssDockBtn} ${panel===p.id?styles.ssDockActive:''}`} onClick={() => togglePanel(p.id)}>
                  <span className={styles.ssDockIcon}><Icon name={p.icon}/>{badge > 0 && <span className={styles.ssDockBadge}>{badge}</span>}</span>
                  <span className={styles.ssDockLbl}>{lang==='ja'?p.ja:p.en}</span>
                </button>
              )
            })}
            <div className={styles.ssDockSep}/>
            <button className={`${styles.ssDockBtn} ${showPinnedFilter?styles.ssDockActive:''}`} onClick={() => setShowPinnedFilter(v => !v)} title={T.pinnedOnly}>
              <span className={styles.ssDockIcon}><Icon name="pin"/></span>
              <span className={styles.ssDockLbl}>{lang==='ja'?'ピン・仲間':'Pins'}</span>
            </button>
            <button className={styles.ssDockBtn} onClick={() => setZen(true)} title={lang==='ja'?'集中モード (Esc で戻る)':'Focus mode (Esc to exit)'}>
              <span className={styles.ssDockIcon}><Icon name="focus"/></span>
              <span className={styles.ssDockLbl}>{lang==='ja'?'集中':'Focus'}</span>
            </button>
            <button className={`${styles.ssDockBtn} ${styles.ssDockLeave}`} onClick={leaveRoom}>
              <span className={styles.ssDockIcon}><Icon name="leave"/></span>
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
                <button className={styles.btnStart} onClick={timer.toggle}>{timer.running?(lang==='ja'?'一時停止':'Pause'):(lang==='ja'?'スタート':'Start')}</button>
                <button className={styles.btnReset} onClick={() => setZen(false)}>{lang==='ja'?'戻る':'Exit'}</button>
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
                    <div style={{ fontSize:10, color:'var(--muted)' }}>{friendStatus(chatFriendId!).label}</div>
                  </div>
                </div>
                <button className={styles.chatClose} onClick={() => setChatFriendId(null)}>✕</button>
              </div>
              <div className={styles.chatMsgs}>
                {chatMessages.map((msg: any) => (
                  <div key={msg.id} className={`${styles.msg} ${msg.sender_id===profile.id?styles.msgMe:styles.msgThem}`}>
                    <div className={styles.msgBubble}><ChatBubbleContent content={msg.content} mine={msg.sender_id===profile.id} lang={lang}/></div>
                    <div className={styles.msgTime}>{new Date(msg.created_at).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}</div>
                  </div>
                ))}
                <div ref={chatEndRef}/>
              </div>
              {chatMessages.length < 2 && (
                <div className={styles.chatHints} aria-label={lang==='ja'?'話しかけのヒント':'Message ideas'}>
                  {(lang==='ja'?CHAT_HINTS_JA:CHAT_HINTS_EN).map(h => <button key={h} type="button" onClick={() => setChatInput(h)}>{h}</button>)}
                </div>
              )}
              <div className={styles.chatInputRow}>
                <input className={styles.chatInput} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key==='Enter'&&handleSendMsg()} placeholder={chatFriendId && blockedIds.has(chatFriendId) ? (lang==='ja'?'ブロック中のため送れません':'Blocked') : T.messagePlaceholder} disabled={!!chatFriendId && blockedIds.has(chatFriendId)}/>
                <button className={styles.chatSend} onClick={handleSendMsg}>{T.send}</button>
              </div>
            </div>
          ) : panel && (
            <>
              <div className={styles.ssDrawerHead}>
                <span className={styles.ssDrawerTitle}><Icon name={DOCK_PANELS.find(p => p.id === panel)!.icon} size={16}/> {lang==='ja'?DOCK_PANELS.find(p => p.id === panel)?.ja:DOCK_PANELS.find(p => p.id === panel)?.en}</span>
                <button className={styles.ssIconBtn} onClick={() => setPanel(null)} aria-label="close"><Icon name="x" size={16}/></button>
              </div>
              <div className={styles.srPanel}>

                {panel==='timer' && (
                  <>
                    <div>
                      <div className={styles.timerModes}>
                        {(['focus','short','long'] as const).map((m,i) => (
                          <button key={m} className={`${styles.modeBtn} ${timer.mode===m?styles.modeBtnActive:''}`} onClick={() => timer.switchMode(m)}>
                            {[tr('集中','Focus'),tr('小休憩','Short'),tr('長休憩','Long')][i]}
                          </button>
                        ))}
                        <button className={`${styles.modeBtn} ${timer.mode==='custom'?styles.modeBtnActive:''}`}
                          onClick={() => setShowCustomTimer(true)}>{tr('カスタム','Custom')}</button>
                      </div>
                      {timer.mode === 'custom' && (
                        <div style={{ textAlign:'center', fontSize:11, color:'var(--accent)', marginBottom:6 }}>
                          {tr(`集中${timer.customFocusMins}分 / 休憩${timer.customBreakMins}分`, `Focus ${timer.customFocusMins}m / Break ${timer.customBreakMins}m`)}
                          <button onClick={() => setShowCustomTimer(true)} style={{ marginLeft:6, fontSize:10, color:'var(--muted)', background:'transparent', border:'none', cursor:'pointer' }}>{tr('変更','Edit')}</button>
                        </div>
                      )}
                      <div className={styles.ringWrap}>
                        <svg className={styles.timerRing} width="170" height="170" viewBox="0 0 110 110">
                          <defs>
                            <linearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="var(--accent)"/><stop offset="100%" stopColor="#a78bfa"/>
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
                        <button className={styles.btnStart} onClick={timer.toggle}>{timer.running?(lang==='ja'?'一時停止':'Pause'):(lang==='ja'?'スタート':'Start')}</button>
                        <button className={styles.btnReset} onClick={timer.reset}>↺</button>
                      </div>
                      <div className={styles.pomoDots}>
                        {[0,1,2,3].map((i: any) => <div key={i} className={`${styles.pdot} ${i<(timer.pomosCompleted%4)?styles.pdotDone:''}`}/>)}
                      </div>
                      <div style={{ textAlign:'center', fontSize:11, color:'var(--muted)', marginTop:8 }}>{lang==='ja'?'セッション':'Session'} {timer.sessionCount} / 4</div>
                    </div>
                    <div>
                      <div className={styles.secLabel}>{lang==='ja'?'勉強科目':'Subject'}</div>
                      <button onClick={() => setShowSubjectPicker(true)} style={{ width:'100%', padding:'8px 12px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, color:mySubject?'var(--accent)':'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:'inherit', textAlign:'left', transition:'.2s' }}>
                        {mySubject || tr('科目を選択...','Choose subject...')} ▾
                      </button>
                    </div>
                  </>
                )}

                {panel==='tasks' && (
                  <>
                    <div>
                      <div className={styles.secLabel}>{lang==='ja'?'今日の一言':'Status message'}</div>
                      <div style={{ display:'flex', gap:6 }}>
                        <input placeholder={lang==='ja'?'今日の一言を投稿...':'Share what you are working on...'}
                          value={dailyMsgInput} onChange={e => setDailyMsgInput(e.target.value)}
                          onKeyDown={e => { if (e.key==='Enter') { saveDailyMessage(dailyMsgInput); setDailyMsgInput('') } }}
                          className={styles.tInput}/>
                        <button onClick={() => { saveDailyMessage(dailyMsgInput); setDailyMsgInput('') }} className={styles.chatSend}>{lang==='ja'?'投稿':'Post'}</button>
                      </div>
                    </div>
                    <div>
                      <div className={styles.secLabel}>{lang==='ja'?'タスク':'Tasks'}</div>
                      <TaskPanel userId={profile.id} roomId={room.id} tasks={tasks}
                        onAddTask={addTask} onCompleteTask={completeTask} onDeleteTask={deleteTask}
                        onUpdateShare={updateTaskShareLocal}
                        friends={friendsForTaskPanel} lang={lang}/>
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
                      <ShareCard lang={lang} displayName={profile.display_name} todaySeconds={todaySeconds} pomosToday={pomosToday} streak={streak} week={weeklyStats as any} onToast={showToast}/>
                    </div>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                        <div className={styles.secLabel} style={{ marginBottom:0 }}>{statView==='week'?tr('今週','This week'):tr('今月','This month')}</div>
                        <div style={{ display:'flex', gap:4 }}>
                          <button onClick={() => setStatView('week')} style={{ padding:'2px 8px', borderRadius:4, border:`1px solid ${statView==='week'?'var(--accent)':'var(--border)'}`, background:statView==='week'?'rgba(125,149,255,.15)':'transparent', color:statView==='week'?'var(--accent)':'var(--muted)', fontSize:10, cursor:'pointer', fontFamily:'inherit' }}>{tr('週','W')}</button>
                          <button onClick={() => setStatView('month')} style={{ padding:'2px 8px', borderRadius:4, border:`1px solid ${statView==='month'?'var(--accent)':'var(--border)'}`, background:statView==='month'?'rgba(125,149,255,.15)':'transparent', color:statView==='month'?'var(--accent)':'var(--muted)', fontSize:10, cursor:'pointer', fontFamily:'inherit' }}>{tr('月','M')}</button>
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
                          {monthStats.length===0 && <div style={{ fontSize:11, color:'var(--muted)', textAlign:'center', width:'100%' }}>{tr('今月のデータなし','No data this month')}</div>}
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
                    <AmbiencePanel ambience={ambience} lang={lang}/>
                    <div className={styles.secLabel} style={{ marginBottom:-8 }}>BGM</div>
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
                    <StudyTogether lang={lang} room={room} userId={profile.id} displayName={profile.display_name} myPrivateRooms={myPrivateRooms} onToast={showToast}/>
                    {pendingIn.length > 0 && (
                      <div>
                        {pendingIn.map((req: any) => {
                          const rp = req.profiles
                          return (
                            <div key={req.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', background:'rgba(125,149,255,.08)', border:'1px solid rgba(125,149,255,.3)', borderRadius:8, marginBottom:5 }}>
                              <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0, overflow:'hidden' }}>
                                {rp?.avatar_url ? <img src={rp.avatar_url} width={28} height={28} style={{ borderRadius:'50%' }} alt=""/> : rp?.display_name?.[0]}
                              </div>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:12, fontWeight:600 }}>{rp?.display_name}</div>
                                <div style={{ fontSize:10, color:'var(--muted)' }}>{lang==='ja'?'フレンド申請が届いています':'Friend request'}</div>
                              </div>
                              <button onClick={() => declineRequest(req.id)}
                                style={{ minHeight:32, padding:'4px 10px', background:'transparent', border:'1px solid var(--border2)', borderRadius:8, color:'var(--muted2)', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
                                {lang==='ja'?'見送る':'Decline'}
                              </button>
                              <button onClick={() => acceptRequest(req.id, rp?.display_name ?? '')}
                                style={{ minHeight:32, padding:'4px 12px', background:'var(--accent)', border:'none', borderRadius:8, color:'#fff', fontSize:12, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>
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
                              <div className={styles.friendDot} style={{ background: ({ here:'var(--accent)', studying:'var(--accent3)', online:'var(--warn)', offline:'rgba(var(--fg),.2)' } as Record<string,string>)[friendStatus(f.addressee_id).tone] }}/>
                            </div>
                            <div className={styles.friendInfo}>
                              <div className={styles.friendName}>{fp.display_name}{unread>0&&<span className={styles.unreadBadge}>{unread}</span>}</div>
                              <FriendPresence status={friendStatus(f.addressee_id)} lang={lang}
                                onJoin={joinFriendRoom}
                                onInvite={() => inviteFriend(f.addressee_id, fp.display_name)}
                                onAskInvite={() => askInvite(f.addressee_id, fp.display_name)}/>
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
                    <BlockedList lang={lang} blocked={blocked} onUnblock={handleUnblock}/>
                  </>
                )}

                {panel==='rooms' && (
                  <div className={styles.ssRoomList}>
                    {[...(room.is_private && !myPrivateRooms.some(r => r.id === room.id) ? [room] : []), ...myPrivateRooms].map((r: any) => (
                      <div key={r.id} className={`${styles.roomCard} ${r.id===room.id?styles.roomCardActive:''}`} onClick={() => r.id !== room.id && router.push(`/room/${r.id}`)}>
                        <div className={styles.roomName}>{r.emoji} {r.name} <span style={{ fontSize:10, color:'var(--muted)' }}>🔒 {lang==='ja'?'友達だけ':'Friends only'}</span>{r.id===room.id && <span style={{ marginLeft:6, fontSize:10, color:'var(--accent3)' }}>● {lang==='ja'?'入室中':'Here'}</span>}</div>
                        <div className={styles.roomDesc}>{r.description}</div>
                      </div>
                    ))}
                    <button className={styles.ssCamCta} style={{ margin:'2px 0 8px' }} onClick={() => togglePanel('friends')}>🤝 {lang==='ja'?'友達だけの部屋を作る・招待する':'Create a room for friends'}</button>
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
                    {notificationsView.map((n,i) => (
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
                      + {tr('勉強会を予約する','Schedule a study group')}
                    </button>
                    <TimelineCalendar
                      userId={profile.id}
                      roomId={room.id}
                      tasks={tasks}
                      scheduledSessions={scheduledSessions}
                      onJoinSession={async (s) => {
                        const target = scheduledSessions.find((x: any) => x.id === s.id) as any
                        if (target?.room_id && (await joinSessionApi(s.id))) router.push('/room/' + target.room_id)
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
                      const badgeText = isStarting ? tr('🟢 進行中','🟢 Live') : isSoon ? ('⏰ ' + tr(diffMin + '分後', 'in ' + diffMin + 'm')) : isPast ? tr('終了','Ended') : fmtScheduled(s.scheduled_at)
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
                            ⏱ {s.duration_mins}{tr('分','m')}
                            {s.subject && <span> · 🎯 {s.subject}</span>}
                          </div>
                          <div style={{ fontSize:10, color:'var(--muted)', marginBottom:8 }}>
                            {tr('主催','Host')}: {(s.profiles as { display_name: string } | undefined)?.display_name ?? tr('あなた','You')}
                          </div>
                          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                            {s.host_id !== profile.id && !isPast && (
                              <button onClick={() => joinSession(s.id)}
                                style={{ padding:'5px 12px', background:'rgba(125,149,255,.12)', border:'1px solid rgba(125,149,255,.25)', borderRadius:6, color:'var(--accent)', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
                                ✋ {tr('参加登録','Join')}
                              </button>
                            )}
                            {(isStarting || isSoon) && (
                              <button onClick={async () => {
                                // Get the session's private room and navigate there
                                if (s.room_id) {
                                  if (await joinSessionApi(s.id)) router.push('/room/' + s.room_id)
                                } else {
                                  showToast(tr('❌ ルーム情報が取得できませんでした','❌ Could not load the room'))
                                }
                              }}
                                style={{ padding:'5px 12px', background: isStarting ? 'var(--accent3)' : 'var(--warn)', border:'none', borderRadius:6, color:'#000', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                                {isStarting ? tr('🚀 会場の部屋へ入室','🚀 Enter room') : tr('📍 準備する','📍 Get ready')}
                              </button>
                            )}
                            {s.host_id === profile.id && s.room_id && myPrivateRooms.some((r: any) => r.id === s.room_id) && !isPast && (
                              <button onClick={() => copySessionInviteByRoom(s.room_id)}
                                style={{ padding:'5px 10px', background:'rgba(125,149,255,.12)', border:'1px solid rgba(125,149,255,.25)', borderRadius:6, color:'var(--accent)', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
                                🔗 {tr('招待リンク','Invite link')}
                              </button>
                            )}
                            {s.host_id === profile.id && (
                              <button onClick={async () => {
                                if (!window.confirm(tr('この予約を削除しますか？','Delete this session?'))) return
                                await fetch('/api/study-group', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: s.id }) }).catch(() => {})
                                fetchSessions()
                                showToast(tr('🗑 予約を削除しました','🗑 Session deleted'))
                              }}
                                style={{ padding:'5px 10px', background:'transparent', border:'1px solid var(--border)', borderRadius:6, color:'var(--muted)', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
                                🗑 {tr('削除','Delete')}
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
          timer={timer} members={orderedMembers} friends={displayFriends} pendingIn={pendingIn}
          myPrivateRooms={myPrivateRooms}
          shareCard={<ShareCard lang={lang} displayName={profile.display_name} todaySeconds={todaySeconds} pomosToday={pomosToday} streak={streak} week={weeklyStats as any} onToast={showToast}/>}
          studyTogether={<><StudyTogether lang={lang} room={room} userId={profile.id} displayName={profile.display_name} myPrivateRooms={myPrivateRooms} onToast={showToast}/><BlockedList lang={lang} blocked={blocked} onUnblock={handleUnblock}/></>}
          renderFriendPresence={(fid: string, name: string) => (
            <FriendPresence status={friendStatus(fid)} lang={lang} onJoin={joinFriendRoom}
              onInvite={() => inviteFriend(fid, name)} onAskInvite={() => askInvite(fid, name)}/>
          )}
          unreadCounts={unreadCounts} tasks={tasks} localStream={localStream} remoteStreams={remoteStreams}
          cameraOn={cameraOn} bgmPlaying={bgmPlaying} volume={volume} bgmGainRef={bgmGainRef} ambience={ambience}
          notifications={notificationsView} weeklyStats={weeklyStats} currentTask={currentTask}
          onToggleCamera={() => setCameraOn(v => !v)}
          onAddTask={addTask} onCompleteTask={completeTask} onDeleteTask={deleteTask}
          onOpenChat={(fid) => setChatFriendId(fid)}
          onBlock={(uid,name) => setBlockModal({ userId:uid, name })}
          onReport={(uid,name) => setReportModal({ userId:uid, name })}
          onViewProfile={setViewUserId}
          pinState={(uid: string) => matchedIds.has(uid) ? 'pair' : isPinned(uid) ? (getMyPin(uid)?.is_secret ? 'secret' : 'pinned') : 'none'}
          onPin={onPinClick}
          seatTag={(uid: string) => uid === neighborId ? (lang==='ja'?'🪑 きょうのとなり':'🪑 Neighbor')
            : myGoal && memberGoals[uid] === myGoal ? (lang==='ja'?'🎯 同じ目標':'🎯 Same goal')
            : (!matchedIds.has(uid) && pinFrom(uid)) ? (lang==='ja'?'📌 あなたをピン':'📌 Pinned you') : null}
          onAcceptFriend={(id: string) => acceptRequest(id, (pendingIn.find((r: any) => r.id === id) as any)?.profiles?.display_name ?? '')}
          onDeclineFriend={declineRequest}
          onToggleBgm={toggleBgm} onSetVolume={setVolume}
          onJoinRoom={(rid) => router.push(`/room/${rid}`)}
          onLeaveRoom={leaveRoom}
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
              <div style={{ fontSize:11, color:'var(--muted)' }}>{friendStatus(chatFriendId).label}</div>
            </div>
          </div>
          <div className={styles.mobChatMsgs}>
            {chatMessages.map((msg: any) => (
              <div key={msg.id} className={`${styles.msg} ${msg.sender_id===profile.id?styles.msgMe:styles.msgThem}`}>
                <div className={styles.msgBubble}><ChatBubbleContent content={msg.content} mine={msg.sender_id===profile.id} lang={lang}/></div>
                <div className={styles.msgTime}>{new Date(msg.created_at).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}</div>
              </div>
            ))}
            <div ref={chatEndRef}/>
          </div>
          {chatMessages.length < 2 && (
                <div className={styles.chatHints} aria-label={lang==='ja'?'話しかけのヒント':'Message ideas'}>
                  {(lang==='ja'?CHAT_HINTS_JA:CHAT_HINTS_EN).map(h => <button key={h} type="button" onClick={() => setChatInput(h)}>{h}</button>)}
                </div>
              )}
              <div className={styles.mobChatInputRow}>
            <input className={styles.chatInput} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key==='Enter'&&handleSendMsg()} placeholder={chatFriendId && blockedIds.has(chatFriendId) ? (lang==='ja'?'ブロック中のため送れません':'Blocked') : T.messagePlaceholder} disabled={!!chatFriendId && blockedIds.has(chatFriendId)}/>
            <button className={styles.chatSend} onClick={handleSendMsg}>{T.send}</button>
          </div>
        </div>
      )}

      {/* MOBILE BOTTOM NAV */}
      <nav className={styles.bottomNav}>
        {(['room','timer','friends','stats'] as const).map((screen,i) => {
          const hasNotif = screen==='friends' && (pendingIn.length>0 || Object.values(unreadCounts).some(c=>c>0))
          return (
            <button key={screen} className={`${styles.bnavBtn} ${activeMobScreen===screen?styles.bnavBtnActive:''}`} onClick={() => setActiveMobScreen(screen)}>
              <div className={styles.bnavIcon} style={{ position:'relative' }}>
                <Icon name={(['camera','timer','users','stats'] as const)[i]} size={19}/>
                {hasNotif && <span style={{ position:'absolute', top:-2, right:-2, width:8, height:8, borderRadius:'50%', background:'var(--accent)', boxShadow:'0 0 0 2px var(--bg)' }}/>}
              </div>
              <span className={styles.bnavLbl}>{lang==='ja'?['ルーム','タイマー','フレンド','記録'][i]:['Room','Timer','Friends','Stats'][i]}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
