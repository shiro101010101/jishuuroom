'use client'
// components/room/MobileScreens.tsx
import AmbiencePanel from './AmbiencePanel'
import type { useAmbience } from '@/hooks/useAmbience'
import { useRef, useState, useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import TaskPanel from './TaskPanel'
import type { Profile, Room, RoomMember, Task, Friendship } from '@/lib/supabase/types'
import type { useTimer } from '@/hooks/useTimer'
import type { SharedTask, StudyPair } from '@/hooks/useTaskSharing'
import SafetyPanel from './SafetyPanel'
import RankingPanel from './RankingPanel'
import styles from './MobileScreens.module.css'

type TimerState = ReturnType<typeof useTimer>

type Props = {
  activeScreen: 'timer' | 'room' | 'friends' | 'stats'
  profile: Profile
  room: Room
  allRooms: Room[]
  timer: TimerState
  members: (RoomMember & { profiles: { display_name: string; avatar_url: string | null } })[]
  friends: (Friendship & { profiles: Profile })[]
  pendingIn: (Friendship & { profiles: Profile })[]
  unreadCounts: Record<string, number>
  tasks: Task[]
  localStream: MediaStream | null
  remoteStreams: Map<string, MediaStream>
  cameraOn: boolean
  bgmPlaying: string | null
  volume: number
  bgmGainRef: React.RefObject<GainNode | null>
  ambience: ReturnType<typeof useAmbience>
  notifications: { icon: string; text: string; time: string }[]
  weeklyStats: { day_of_week: number; total_seconds: number }[]
  currentTask: string
  onToggleCamera: () => void
  onAddTask: (title: string) => Promise<void>
  onCompleteTask: (task: Task) => Promise<void>
  onDeleteTask: (id: string) => Promise<void>
  onOpenChat: (friendId: string) => void
  onBlock: (userId: string, name: string) => void
  onReport: (userId: string, name: string) => void
  onViewProfile?: (userId: string) => void
  /** ピンの状態（none / pinned / secret / pair）とピンのボタン */
  pinState?: (userId: string) => 'none' | 'pinned' | 'secret' | 'pair'
  onPin?: (userId: string, name: string) => void
  /** カードに 1 つだけ出す印（🪑 きょうのとなり・🎯 同じ目標 など） */
  seatTag?: (userId: string) => string | null
  onAcceptFriend: (friendshipId: string) => void
  onDeclineFriend?: (friendshipId: string) => void
  onToggleBgm: (id: string) => void
  onSetVolume: (v: number) => void
  onJoinRoom: (roomId: string) => void
  onLeaveRoom: () => void
  todaySeconds: number
  pomosToday: number
  tasksDoneToday: number
  lang: 'ja' | 'en'
  onUpdateShare?: (taskId: string, scope: 'private' | 'friends' | 'room') => Promise<void>
  faceDetectEnabled: boolean
  noFaceThreshold: number
  awayEnabled: boolean
  awayMinutes: number
  faceStatus: string
  noFaceSeconds: number
  onFaceDetectChange: (v: boolean) => void
  onNoFaceThresholdChange: (v: number) => void
  onAwayEnabledChange: (v: boolean) => void
  onAwayMinutesChange: (v: number) => void
  cameraOnForSafety: boolean
  userId: string
  rankRefresh?: number
  myPrivateRooms?: Room[]
  /** 今日の記録カード（SNS 共有） */
  shareCard?: ReactNode
  /** 「友達と勉強する」カード */
  studyTogether?: ReactNode
  /** フレンドの居場所と合流・招待ボタン */
  renderFriendPresence?: (friendId: string, name: string) => ReactNode
}

const BGM_TRACKS = [
  { id: 'lofi',   nameJa: 'Lo-fi Hip Hop',     nameEn: 'Lo-fi Hip Hop',     icon: '🎹' },
  { id: 'rain',   nameJa: '雨音 + カフェ',       nameEn: 'Rain + Cafe',       icon: '🌧️' },
  { id: 'nature', nameJa: '森の環境音',           nameEn: 'Nature Sounds',     icon: '🌿' },
  { id: 'cafe',   nameJa: 'カフェの雑音',         nameEn: 'Cafe Ambience',     icon: '☕' },
  { id: 'piano',  nameJa: 'ピアノ アンビエント',  nameEn: 'Piano Ambient',     icon: '🎵' },
]

const QUOTES = [
  { text: '千里の道も一歩から。', author: '老子' },
  { text: '努力した者が全て報われるとは限らない。しかし、成功した者は皆努力している。', author: '王貞治' },
  { text: 'できるかどうかではなく、やるかどうかだ。', author: '孫正義' },
]

export default function MobileScreens({
  activeScreen, profile, room, allRooms, timer, members, friends, pendingIn,
  unreadCounts, tasks, localStream, remoteStreams, cameraOn, bgmPlaying,
  volume, bgmGainRef, ambience, notifications, weeklyStats, currentTask,
  onToggleCamera, onAddTask, onCompleteTask, onDeleteTask,
  onOpenChat, onBlock, onReport, onViewProfile, pinState, onPin, seatTag, onAcceptFriend, onDeclineFriend,
  onToggleBgm, onSetVolume, onJoinRoom, onLeaveRoom,
  todaySeconds, pomosToday, tasksDoneToday,
  lang, onUpdateShare,
  faceDetectEnabled, noFaceThreshold, awayEnabled, awayMinutes,
  faceStatus, noFaceSeconds,
  onFaceDetectChange, onNoFaceThresholdChange,
  onAwayEnabledChange, onAwayMinutesChange,
  cameraOnForSafety,
  userId,
  rankRefresh = 0,
  myPrivateRooms = [], studyTogether, renderFriendPresence, shareCard,
}: Props) {
  const router = useRouter()
  const [quote, setQuote] = useState(QUOTES[0])
  useEffect(() => { setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]) }, [])

  const fmtTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  const fmtStudy = (s: number) =>
    `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`

  const weekDays = lang === 'ja' ? ['日', '月', '火', '水', '木', '金', '土'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const weekMap: Record<number, number> = {}
  weeklyStats.forEach(d => { weekMap[d.day_of_week] = Number(d.total_seconds) })
  const maxWeek = Math.max(...Object.values(weekMap), 3600)
  const today = new Date().getDay()

  const friendsForPanel = friends.map(f => ({
    id: f.addressee_id,
    display_name: (f.profiles as Profile).display_name,
    avatar_url: (f.profiles as Profile).avatar_url,
  }))

  // ── TIMER SCREEN ─────────────────────────────────────────────
  const TimerScreen = (
    <div className={`${styles.screen} ${activeScreen === 'timer' ? styles.screenActive : ''}`}>
      <div className={styles.scroll}>

        {/* Mode buttons */}
        <div className={styles.timerModes}>
          {(['focus', 'short', 'long'] as const).map((m, i) => (
            <button key={m}
              className={`${styles.modeBtn} ${timer.mode === m ? styles.modeBtnActive : ''}`}
              onClick={() => timer.switchMode(m)}>
              {(lang === 'ja' ? ['集中 25分', '休憩 5分', '長休 15分'] : ['Focus 25m', 'Break 5m', 'Long 15m'])[i]}
            </button>
          ))}
        </div>

        {/* Big ring */}
        <div className={styles.ringWrap}>
          <svg style={{ transform: 'rotate(-90deg)', filter: 'drop-shadow(0 0 10px rgba(125,149,255,.4))' }}
            width="220" height="220" viewBox="0 0 220 220">
            <defs>
              <linearGradient id="mg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--accent)" />
                <stop offset="100%" stopColor="#a78bfa" />
              </linearGradient>
            </defs>
            <circle fill="none" stroke="var(--border)" strokeWidth="8" cx="110" cy="110" r="100" />
            <circle fill="none" stroke="url(#mg)" strokeWidth="8" strokeLinecap="round"
              cx="110" cy="110" r="100"
              strokeDasharray="628.3"
              strokeDashoffset={628.3 - timer.progress * 628.3}
              style={{ transition: 'stroke-dashoffset 1s linear' }} />
          </svg>
          <div className={styles.ringInner}>
            <div className={styles.bigDigits}>{fmtTime(timer.seconds)}</div>
            <div className={styles.bigLbl}>
              {timer.mode === 'focus' ? '集中モード' : timer.mode === 'short' ? lang==='ja'?'小休憩':'Short Break' : lang==='ja'?'長休憩':'Long Break'}
            </div>
          </div>
        </div>

        {/* Pomo dots */}
        <div className={styles.pomoDots}>
          {[0,1,2,3].map(i => (
            <div key={i} className={`${styles.pdot} ${i < (timer.pomosCompleted % 4) ? styles.pdotDone : ''}`} />
          ))}
        </div>

        {/* Controls */}
        <div className={styles.timerCtrl}>
          <button className={styles.btnStart} onClick={timer.toggle}>
            {timer.running ? (lang === 'ja' ? '⏸ 一時停止' : '⏸ Pause') : (lang === 'ja' ? '▶ スタート' : '▶ Start')}
          </button>
          <button className={styles.btnReset} onClick={timer.reset}>↺</button>
        </div>

        {/* Focus task */}
        <div className={styles.focusCard}>
          <div className={styles.focusLbl}>{lang === 'ja' ? '集中中のタスク' : 'Current task'}</div>
          <div className={styles.focusTask}>{currentTask}</div>
          <div className={styles.sessionBadge}>{lang === 'ja' ? 'セッション' : 'Session'} {timer.sessionCount} / 4</div>
        </div>

        {/* Tasks */}
        <div className={styles.section}>
          <div className={styles.secLabel}>✅ {lang === 'ja' ? 'タスク管理' : 'Tasks'}</div>
          <TaskPanel
            userId={profile.id}
            roomId={room.id}
            tasks={tasks}
            onAddTask={onAddTask}
            onCompleteTask={onCompleteTask}
            onDeleteTask={onDeleteTask}
            friends={friendsForPanel}
            lang={lang}
          />
        </div>

      </div>
    </div>
  )

  // ── ROOM SCREEN ───────────────────────────────────────────────
  const RoomScreen = (
    <div className={`${styles.screen} ${activeScreen === 'room' ? styles.screenActive : ''}`}>
      <div className={styles.scroll}>

        {/* Camera bar */}
        <div className={styles.camBar}>
          <button
            className={`${styles.camToggle} ${cameraOn ? styles.camToggleOn : ''}`}
            onClick={onToggleCamera}>
            📷 {cameraOn ? (lang==='ja'?'カメラON':'Camera ON') : (lang==='ja'?'カメラOFF':'Camera OFF')}
          </button>
          <span className={styles.micBadge}>🔇 {lang==='ja'?'マイク禁止':'Mic Off'}</span>
          <button className={styles.leaveBtn} onClick={onLeaveRoom}>{lang==='ja'?'退室':'Leave'}</button>
        </div>

        {/* タイマー（部屋を見ながら操作できるように、ここにも小さく置く） */}
        <div className={styles.miniTimer}>
          <span className={styles.miniTimerTime}>{String(Math.floor(timer.seconds / 60)).padStart(2, '0')}:{String(timer.seconds % 60).padStart(2, '0')}</span>
          <span className={styles.miniTimerMode}>{timer.mode === 'focus' ? (lang==='ja'?'集中':'Focus') : timer.mode === 'custom' ? (lang==='ja'?'カスタム':'Custom') : (lang==='ja'?'休憩':'Break')}</span>
          <button className={styles.miniTimerBtn} onClick={timer.toggle} aria-label={timer.running ? (lang==='ja'?'一時停止':'Pause') : (lang==='ja'?'スタート':'Start')}>
            {timer.running ? '⏸' : '▶'}
          </button>
        </div>

        {/* Camera grid 2-col */}
        <div>
          <div className={styles.secLabel}>🎥 {room.name}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8, padding:'0 4px' }}>

            {/* My card */}
            <div className={`${styles.camCard} ${styles.camCardYou}`}>
              {localStream
                ? <video className={styles.camVideo} style={{ aspectRatio:"3/4", objectFit:"cover", width:"100%", height:"auto" }}
                    ref={v => { if (v && v.srcObject !== localStream) v.srcObject = localStream }}
                    autoPlay muted playsInline />
                : <div className={styles.camOff}>
                    <div className={styles.camAv}>
                      {profile.avatar_url
                        ? <img src={profile.avatar_url} alt="" width={40} height={40} style={{ borderRadius: '50%' }} />
                        : profile.display_name[0]}
                    </div>
                  </div>}
              <div className={styles.camName}>
                <span className={styles.camNameTxt}>{profile.display_name.slice(0, 6)}</span>
                <span className={`${styles.camBadge} ${styles.badgeStudying}`}>●</span>
              </div>
            </div>

            {/* Others */}
            {members.filter(m => m.user_id !== profile.id).map(m => {
              const rs = remoteStreams.get(m.user_id)
              const mp = m.profiles
              const away = m.status === 'away'
              return (
                <div key={m.id} className={`${styles.camCard} ${away ? styles.camCardAway : ''}`} onClick={() => onViewProfile?.(m.user_id)} style={{ cursor: 'pointer' }}>
                  {away && <div className={styles.awayTag}>{lang==='ja'?'😴 席外':'😴 Away'}</div>}
                  {rs
                    ? <video className={styles.camVideo} style={{ aspectRatio:"3/4", objectFit:"cover", width:"100%", height:"auto" }}
                        ref={v => { if (v && v.srcObject !== rs) v.srcObject = rs }}
                        autoPlay playsInline />
                    : <div className={styles.camOff}>
                        <div className={styles.camAv}>
                          {mp.avatar_url
                            ? <img src={mp.avatar_url} alt="" width={40} height={40} style={{ borderRadius: '50%' }} />
                            : mp.display_name[0]}
                        </div>
                      </div>}
                  {onPin && (() => {
                    const st = pinState?.(m.user_id) ?? 'none'
                    const label = st === 'pair' ? '🤝 仲間' : st === 'secret' ? '🤫 ひみつ' : st === 'pinned' ? '📌 ピン中' : '📌 ピン'
                    const aria = lang !== 'ja' ? `Pin ${mp.display_name}`
                      : st === 'pair' ? `${mp.display_name}さんとは勉強仲間です。ピンを編集`
                      : st === 'none' ? `${mp.display_name}さんをピン` : `${mp.display_name}さんのピンを編集・外す`
                    return (
                      <button type="button" className={`${styles.pinMini} ${st !== 'none' ? styles.pinMiniOn : ''} ${st === 'pair' ? styles.pinMiniPair : ''}`}
                        aria-pressed={st !== 'none'} aria-label={aria}
                        onClick={e => { e.stopPropagation(); onPin(m.user_id, mp.display_name) }}>{lang === 'ja' ? label : label.replace('ピン中', 'Pinned').replace('ピン', 'Pin').replace('仲間', 'Buddy').replace('ひみつ', 'Secret')}</button>
                    )
                  })()}
                  {seatTag?.(m.user_id) && <div className={styles.seatTag}>{seatTag(m.user_id)}</div>}
                  <div className={styles.camName}>
                    <span className={styles.camNameTxt}>{mp.display_name.slice(0, 6)}</span>
                    <button className={styles.reportMiniBtn} aria-label={lang === 'ja' ? `${mp.display_name} を通報` : `Report ${mp.display_name}`}
                      onClick={e => { e.stopPropagation(); onReport(m.user_id, mp.display_name) }}>⚠️</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Safety settings */}
        <div style={{ padding:'0 0 8px' }}>
          <div className={styles.secLabel}>🛡️ {lang==='ja'?'離席・安全設定':'Safety Settings'}</div>
          <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 12px', display:'flex', flexDirection:'column', gap:8 }}>
            {/* Tab detection */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:12, color:'var(--muted2)' }}>📱 {lang==='ja'?'別タブ検出':'Tab Switch'}</span>
              <span style={{ fontSize:11, color:'#34d399', fontWeight:600 }}>{lang==='ja'?'常時ON':'Always ON'}</span>
            </div>
            {/* Face detection */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:12, color:'var(--muted2)' }}>😊 {lang==='ja'?'顔検出':'Face Detection'}</span>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <label style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <input type="checkbox" checked={faceDetectEnabled}
                    onChange={e => onFaceDetectChange(e.target.checked)}
                    disabled={!cameraOnForSafety}
                    style={{ accentColor:'var(--accent)', width:16, height:16 }}/>
                </label>
                {faceDetectEnabled && cameraOnForSafety && (
                  <select value={noFaceThreshold} onChange={e => onNoFaceThresholdChange(Number(e.target.value))}
                    style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:5, color:'var(--accent)', fontSize:11, cursor:'pointer', fontFamily:'inherit', padding:'2px 4px' }}>
                    <option value={30}>{lang==='ja'?'30秒':'30s'}</option>
                    <option value={60}>{lang==='ja'?'1分':'1min'}</option>
                    <option value={120}>{lang==='ja'?'2分':'2min'}</option>
                    <option value={300}>{lang==='ja'?'5分':'5min'}</option>
                    <option value={600}>{lang==='ja'?'10分':'10min'}</option>
                  </select>
                )}
                {!cameraOnForSafety && <span style={{ fontSize:11, color:'var(--muted)' }}>{lang==='ja'?'カメラOFF':'Camera OFF'}</span>}
              </div>
            </div>
            {/* Face status */}
            {faceDetectEnabled && cameraOnForSafety && (
              <div style={{ fontSize:11, paddingLeft:4,
                color: faceStatus==='face_detected'?'#34d399':faceStatus==='no_face'?'#f87171':'var(--muted)' }}>
                {faceStatus==='face_detected' ? '😊 '+(lang==='ja'?'顔を検出中':'Detected')
                  : faceStatus==='no_face' ? `😴 ${noFaceSeconds}s / ${noFaceThreshold}s`
                  : ''}
              </div>
            )}
            {/* Inactivity detection */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:12, color:'var(--muted2)' }}>⌨️ {lang==='ja'?'操作なし検出':'Inactivity'}</span>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <label style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <input type="checkbox" checked={awayEnabled}
                    onChange={e => onAwayEnabledChange(e.target.checked)}
                    style={{ accentColor:'var(--accent)', width:16, height:16 }}/>
                </label>
                {awayEnabled && (
                  <select value={awayMinutes} onChange={e => onAwayMinutesChange(Number(e.target.value))}
                    style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:5, color:'var(--accent)', fontSize:11, cursor:'pointer', fontFamily:'inherit', padding:'2px 4px' }}>
                    {[1,3,5,10].map(m => <option key={m} value={m}>{m}{lang==='ja'?'分':'min'}</option>)}
                  </select>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Notification settings */}
        <div style={{ padding:'0 0 8px' }}>
          <div className={styles.secLabel}>🛡️ {lang==='ja'?'安全設定':'Safety'}</div>
          <SafetyPanel
            userId={userId}
            cameraOn={cameraOnForSafety}
            faceDetectEnabled={faceDetectEnabled}
            noFaceThreshold={noFaceThreshold}
            awayEnabled={awayEnabled}
            awayMinutes={awayMinutes}
            faceStatus={faceStatus}
            noFaceSeconds={noFaceSeconds}
            lang={lang}
            onFaceDetectChange={onFaceDetectChange}
            onNoFaceThresholdChange={onNoFaceThresholdChange}
            onAwayEnabledChange={onAwayEnabledChange}
            onAwayMinutesChange={onAwayMinutesChange}
          />
        </div>

        {/* Room list */}
        <div>
          <div className={styles.secLabel}>{lang==='ja'?'🏠 ルーム一覧':'🏠 Rooms'}</div>
          <div className={styles.roomList}>
            {[...(room.is_private && !myPrivateRooms.some(r => r.id === room.id) ? [room] : []), ...myPrivateRooms, ...allRooms].map(r => (
              <div key={r.id}
                className={`${styles.roomItem} ${r.id === room.id ? styles.roomItemActive : ''}`}
                onClick={() => router.push(`/room/${r.id}`)}>
                <span className={styles.roomEmoji}>{r.emoji}</span>
                <div className={styles.roomInfo}>
                  <div className={styles.roomName}>{r.name}{r.is_private && <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 6 }}>🔒 {lang==='ja'?'友達だけ':'Friends only'}</span>}</div>
                  <div className={styles.roomDesc}>{r.description}</div>
                </div>
                {r.id === room.id && <span className={styles.inRoomBadge}>{lang==='ja'?'参加中':'In Room'}</span>}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )

  // ── FRIENDS SCREEN ────────────────────────────────────────────
  const FriendsScreen = (
    <div className={`${styles.screen} ${activeScreen === 'friends' ? styles.screenActive : ''}`}>
      <div className={styles.scroll}>

        {studyTogether && <div className={styles.section}>{studyTogether}</div>}

        {/* Pending requests */}
        {pendingIn.length > 0 && (
          <div className={styles.section}>
            <div className={styles.secLabel}>📨 {lang==='ja'?'フレンド申請':'Friend Requests'} ({pendingIn.length})</div>
            {pendingIn.map(req => {
              const fp = req.profiles as Profile
              return (
                <div key={req.id} className={styles.friendReqCard}>
                  <div className={styles.friendAv}>
                    {fp.avatar_url
                      ? <img src={fp.avatar_url} alt="" width={40} height={40} style={{ borderRadius: '50%' }} />
                      : fp.display_name[0]}
                  </div>
                  <div className={styles.friendReqInfo}>
                    <div className={styles.friendReqName}>{fp.display_name}</div>
                    <div className={styles.friendReqMeta}>{lang==='ja'?'フレンド申請が届いています':'Friend request received'}</div>
                  </div>
                  {onDeclineFriend && <button className={styles.declineBtn}
                    onClick={() => onDeclineFriend(req.id)}>{lang==='ja'?'見送る':'Decline'}</button>}
                  <button className={styles.acceptBtn}
                    onClick={() => onAcceptFriend(req.id)}>{lang==='ja'?'承認':'Accept'}</button>
                </div>
              )
            })}
          </div>
        )}

        {/* Friends list */}
        <div className={styles.section}>
          <div className={styles.secLabel}>
            {lang==='ja'?'👥 フレンド':'👥 Friends'} ({friends.length})
          </div>
          {friends.length === 0 && (
            <div className={styles.emptyState}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>👋</div>
              <div>{lang==='ja'?'まだフレンドがいません':'No friends yet'}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                {lang === 'ja' ? '同じ部屋の人の名前を押すと、プロフィールからフレンド申請できます' : "Tap someone's name in your room to send a friend request"}
              </div>
            </div>
          )}
          {friends.map(f => {
            const fp = f.profiles as Profile
            const unread = unreadCounts[f.addressee_id] || 0
            return (
              <div key={f.id} className={styles.friendCard}>
                <div className={styles.friendAv}>
                  {fp.avatar_url
                    ? <img src={fp.avatar_url} alt="" width={40} height={40} style={{ borderRadius: '50%', objectFit: 'cover' }} />
                    : fp.display_name[0]}
                  {/* 状態は名前の下に色付きで出すので、ここでは常時緑の点を出さない */}
                  {!renderFriendPresence && <div className={styles.onlineDot} />}
                </div>
                <div className={styles.friendCardInfo}>
                  <div className={styles.friendCardName}>
                    {fp.display_name}
                    {unread > 0 && <span className={styles.unreadBadge}>{unread}</span>}
                  </div>
                  {renderFriendPresence
                    ? renderFriendPresence(f.addressee_id, fp.display_name)
                    : <div className={styles.friendCardMeta}>{lang==='ja'?'勉強中':'Studying'}</div>}
                </div>
                <div className={styles.friendCardActions}>
                  <button className={styles.chatBtn}
                    onClick={() => onOpenChat(f.addressee_id)}>💬</button>
                  <button className={styles.blockBtn}
                    onClick={() => onBlock(f.addressee_id, fp.display_name)}>🚫</button>
                </div>
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )

  // ── STATS SCREEN ──────────────────────────────────────────────
  const StatsScreen = (
    <div className={`${styles.screen} ${activeScreen === 'stats' ? styles.screenActive : ''}`}>
      <div className={styles.scroll}>

        <div className={styles.secLabel}>{lang==='ja'?'📊 本日の統計':'📊 Today'}</div>
        <div className={styles.statGrid}>
          <div className={styles.statCard}>
            <div className={styles.statVal}>{fmtStudy(todaySeconds)}</div>
            <div className={styles.statSub}>{lang === 'ja' ? '合計勉強時間' : 'Studied today'}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statVal}>{pomosToday}</div>
            <div className={styles.statSub}>{lang==='ja'?'ポモドーロ':'Pomodoros'}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statVal}>{tasksDoneToday}✅</div>
            <div className={styles.statSub}>{lang==='ja'?'タスク完了':'Tasks Done'}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statVal}>{members.length}</div>
            <div className={styles.statSub}>{lang === 'ja' ? '同室人数' : 'In this room'}</div>
          </div>
        </div>
        {shareCard && <div className={styles.section}>{shareCard}</div>}

        <div className={styles.section}>
          <div className={styles.secLabel}>{lang==='ja'?'🏆 勉強時間ランキング':'🏆 Study Ranking'}</div>
          {activeScreen === 'stats' && <RankingPanel userId={userId} roomId={room.id} lang={lang} refreshKey={rankRefresh}/>}
        </div>

        <div className={styles.section}>
          <div className={styles.secLabel}>{lang==='ja'?'📅 今週の記録':'📅 This Week'}</div>
          <div className={styles.weekChart}>
            {weekDays.map((d, i) => {
              const s = weekMap[i] || 0
              const h = Math.max((s / maxWeek) * 100, 3)
              return (
                <div key={d} className={styles.wbarWrap}>
                  <div className={`${styles.wbar} ${i === today ? styles.wbarToday : ''}`}
                    style={{ height: `${h}%` }} />
                  <div className={styles.wlbl}>{d}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div className={styles.section}>
          <AmbiencePanel ambience={ambience} lang={lang}/>
        </div>

        <div className={styles.section}>
          <div className={styles.secLabel}>🎵 BGM</div>
          <div className={styles.bgmList}>
            {BGM_TRACKS.map(t => (
              <div key={t.id}
                className={`${styles.bgmItem} ${bgmPlaying === t.id ? styles.bgmPlaying : ''}`}
                onClick={() => onToggleBgm(t.id)}>
                <span style={{ fontSize: 16 }}>{t.icon}</span>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--muted2)' }}>{lang === 'ja' ? t.nameJa : t.nameEn}</span>
                <div className={styles.bgmPlay}>{bgmPlaying === t.id ? '♪' : '▶'}</div>
              </div>
            ))}
          </div>
          <div className={styles.volRow}>
            <span style={{ fontSize: 13 }}>🔊</span>
            <input type="range" className={styles.volSlider} min="0" max="1" step="0.01"
              value={volume}
              onChange={e => {
                const v = parseFloat(e.target.value)
                onSetVolume(v)
                if (bgmGainRef.current) bgmGainRef.current.gain.value = v
              }} />
            <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 32 }}>
              {Math.round(volume * 100)}%
            </span>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.secLabel}>{lang==='ja'?'💬 今日の言葉':"💬 Today's Quote"}</div>
          <div className={styles.quoteBox}>
            「{quote.text}」
            <div className={styles.quoteAuthor}>— {quote.author}</div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.secLabel}>{lang==='ja'?'🔔 通知':'🔔 Notifications'}</div>
          {notifications.slice(0, 6).map((n, i) => (
            <div key={i} className={styles.notifItem}>
              <span style={{ fontSize: 14 }}>{n.icon}</span>
              <div>
                <div style={{ fontSize: 12 }}>{n.text}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{n.time}</div>
              </div>
            </div>
          ))}
        </div>

        {/* アカウント（退室ボタンの隣に置くと押し間違えるので、ここに分ける） */}
        <div className={styles.section}>
          <div className={styles.secLabel}>{lang==='ja'?'アカウント':'Account'}</div>
          <button className={styles.logoutBtn} onClick={() => signOut({ callbackUrl: '/' })}>{lang==='ja'?'ログアウト':'Log out'}</button>
        </div>

      </div>
    </div>
  )

  return (
    <div className={styles.root}>
      {TimerScreen}
      {RoomScreen}
      {FriendsScreen}
      {StatsScreen}
    </div>
  )
}
