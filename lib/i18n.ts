// lib/i18n.ts — 日本語・英語 対応

export type Lang = 'ja' | 'en'

export const translations = {
  ja: {
    // Header
    online: '人が勉強中',
    logout: 'ログアウト',
    // Timer
    timerTitle: 'ポモドーロタイマー',
    focus: '集中',
    shortBreak: '小休憩',
    longBreak: '長休憩',
    custom: 'カスタム',
    start: '▶ スタート',
    pause: '⏸ 一時停止',
    reset: '↺',
    focusMode: '集中モード',
    settings: '設定',
    // Tasks
    taskTitle: 'タスク管理',
    myTasks: '自分のタスク',
    sharedTasks: '共有タスク',
    addTask: 'タスクを追加...',
    // Subjects
    subjectTitle: '今日の科目',
    subjects: {
      math: '数学', english: '英語', japanese: '国語',
      science: '理科', social: '社会', physics: '物理',
      chemistry: '化学', biology: '生物', history: '歴史',
      programming: 'プログラミング', language: '語学',
      certification: '資格', other: 'その他'
    },
    // Friends
    friendsTitle: 'フレンド',
    noFriends: 'まだフレンドがいません',
    // Room
    cameraOff: 'カメラOFF',
    cameraOn: 'カメラON',
    micBanned: '🔇 マイク禁止',
    leaveRoom: '退室',
    noTalk: 'トークは禁止。チャットでコミュニケーションを。',
    currentTask: '現在の集中タスク',
    session: 'セッション',
    emptyseat: '空席',
    // Stats
    statsTitle: '統計',
    today: '本日',
    totalStudy: '合計勉強時間',
    pomodoros: 'ポモドーロ',
    tasksDone: 'タスク完了',
    streak: '連続日数',
    week: '週',
    month: '月',
    quote: '今日の言葉',
    // BGM
    bgmTitle: 'BGM',
    // Schedule
    scheduleTitle: '予約',
    addSession: '+ セッションを予約する',
    noSessions: '予約中のセッションはありません',
    // Safety
    safetyTitle: '安全設定',
    // Notifications
    notifTitle: '通知',
    // Chat
    messagePlaceholder: 'メッセージ...',
    send: '送信',
    online2: 'オンライン',
    // Daily message
    dailyMsgPlaceholder: '今日の一言を入力...',
    post: '投稿',
    pinnedOnly: 'ピンのみ',
    all: '全員',
    // Toast
    badWord: '🚫 不適切な言葉が含まれています',
    tabWarning: '⚠️ 別のタブに移動しています！勉強に集中しましょう',
    welcomeBack: '📚 おかえり！集中を続けましょう',
    faceWarning: '😴 顔が検出されません！席を外していますか？',
    pomoDone: '🍅 セッション完了！お疲れさまでした',
  },
  en: {
    // Header
    online: ' studying now',
    logout: 'Log out',
    // Timer
    timerTitle: 'Pomodoro Timer',
    focus: 'Focus',
    shortBreak: 'Short Break',
    longBreak: 'Long Break',
    custom: 'Custom',
    start: '▶ Start',
    pause: '⏸ Pause',
    reset: '↺',
    focusMode: 'Focus Mode',
    settings: 'Settings',
    // Tasks
    taskTitle: 'Tasks',
    myTasks: 'My Tasks',
    sharedTasks: 'Shared Tasks',
    addTask: 'Add a task...',
    // Subjects
    subjectTitle: "Today's Subject",
    subjects: {
      math: 'Math', english: 'English', japanese: 'Japanese',
      science: 'Science', social: 'Social Studies', physics: 'Physics',
      chemistry: 'Chemistry', biology: 'Biology', history: 'History',
      programming: 'Programming', language: 'Language',
      certification: 'Certification', other: 'Other'
    },
    // Friends
    friendsTitle: 'Friends',
    noFriends: 'No friends yet',
    // Room
    cameraOff: 'Camera OFF',
    cameraOn: 'Camera ON',
    micBanned: '🔇 Mic Off',
    leaveRoom: 'Leave',
    noTalk: 'No talking. Use chat to communicate.',
    currentTask: 'Current Focus Task',
    session: 'Session',
    emptyseat: 'Empty',
    // Stats
    statsTitle: 'Stats',
    today: 'Today',
    totalStudy: 'Total Study Time',
    pomodoros: 'Pomodoros',
    tasksDone: 'Tasks Done',
    streak: 'Day Streak',
    week: 'Week',
    month: 'Month',
    quote: "Today's Quote",
    // BGM
    bgmTitle: 'BGM',
    // Schedule
    scheduleTitle: 'Schedule',
    addSession: '+ Schedule a Session',
    noSessions: 'No sessions scheduled',
    // Safety
    safetyTitle: 'Safety',
    // Notifications
    notifTitle: 'Notifications',
    // Chat
    messagePlaceholder: 'Message...',
    send: 'Send',
    online2: 'Online',
    // Daily message
    dailyMsgPlaceholder: "Today's message...",
    post: 'Post',
    pinnedOnly: 'Pinned Only',
    all: 'All',
    // Toast
    badWord: '🚫 Inappropriate word detected',
    tabWarning: '⚠️ You switched tabs! Stay focused on studying.',
    welcomeBack: '📚 Welcome back! Keep focusing.',
    faceWarning: '😴 Face not detected! Are you away?',
    pomoDone: '🍅 Session complete! Great work!',
  }
}

export function t(lang: Lang, key: string): string {
  const keys = key.split('.')
  let val: any = translations[lang]
  for (const k of keys) {
    val = val?.[k]
  }
  return val ?? key
}
