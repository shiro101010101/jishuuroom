// lib/demoData.ts — 開発中だけ使う「見た目確認用」のダミーデータ（本番では使われない）
// 実在の人物ではない、架空の名前と数字だけを入れる
export const DEMO_ME = '00000000-0000-4000-8000-000000000001'
const ids = ['2', '3', '4', '5'].map(n => `00000000-0000-4000-8000-00000000000${n}`)
export const DEMO_ROOM_ID = '00000000-0000-4000-8000-0000000000a1'
const now = new Date().toISOString()

export const demoProfile = {
  id: DEMO_ME, username: 'demo', display_name: 'あなた（デモ）', avatar_url: null, bio: '共通テストまであと少し',
  subject: '数学', study_streak: 12, total_study_seconds: 3600 * 86, created_at: now, goal_exam: 'kyotsu',
  is_banned: false, role: 'user',
}

export const demoRooms = [
  { id: DEMO_ROOM_ID, name: 'Room 1', description: 'みんなの自習室 · 何を勉強してもOK', emoji: '📗', is_private: false, created_by: null, invite_code: null, max_members: 20, created_at: now },
  { id: '00000000-0000-4000-8000-0000000000a2', name: 'Room 2', description: 'みんなの自習室 · 何を勉強してもOK', emoji: '📘', is_private: false, created_by: null, invite_code: null, max_members: 20, created_at: now },
  { id: '00000000-0000-4000-8000-0000000000a3', name: 'Room 3', description: 'みんなの自習室 · 何を勉強してもOK', emoji: '📙', is_private: false, created_by: null, invite_code: null, max_members: 20, created_at: now },
]

const names = [['はるか', '英語'], ['そうた', '物理'], ['みお', '簿記'], ['けい', 'プログラミング']]
export const demoMembers = names.map(([n, s], i) => ({
  id: `m${i}`, room_id: DEMO_ROOM_ID, user_id: ids[i], status: i === 2 ? 'break' : 'studying', camera_on: false,
  joined_at: new Date(Date.now() - (i + 1) * 23 * 60_000).toISOString(), last_seen: now,
  profiles: { display_name: n, avatar_url: null, study_streak: 3 + i * 4, subject: s },
}))

export const demoFriends = names.slice(0, 2).map(([n], i) => ({
  id: `f${i}`, requester_id: DEMO_ME, addressee_id: ids[i], status: 'accepted', created_at: now,
  profiles: { id: ids[i], display_name: n, avatar_url: null },
}))

export const demoTasks = ['数学 青チャート 例題 40〜45', '英単語 ターゲット 600〜700', '物理 力学の復習'].map((t, i) => ({
  id: `t${i}`, user_id: DEMO_ME, title: t, completed: false, created_at: now, is_shared: i === 0,
}))

export const demoStats = {
  todaySeconds: 2 * 3600 + 35 * 60, pomosToday: 6, streak: 12,
  week: [1, 2, 3, 4, 5, 6, 0].map((d, i) => ({ day_of_week: d, total_seconds: [5400, 7200, 3600, 9000, 6300, 4800, 9300][i] })),
}

export const demoTop = [
  { user_id: ids[0], rank: 1, display_name: 'はるか', total_seconds: 5 * 3600 + 12 * 60 },
  { user_id: DEMO_ME, rank: 2, display_name: 'あなた（デモ）', total_seconds: 2 * 3600 + 35 * 60 },
  { user_id: ids[1], rank: 3, display_name: 'そうた', total_seconds: 2 * 3600 + 3 * 60 },
]

// ── 勉強会・ピンの見本（ロビーのデモ表示用） ──
const H = 3_600_000
const nextAt = (hoursFromNow: number) => Math.ceil((Date.now() + hoursFromNow * H) / (30 * 60_000)) * 30 * 60_000
const P = (i: number) => ({ id: ids[i], name: names[i][0], avatar: null })
export const demoStudyGroups = {
  sessions: [
    { id: 'g1', title: '英単語もくもく会', startAt: Date.now() - 20 * 60_000, durationMins: 60, repeatDays: [1, 3, 5], host: P(0), members: [P(0), P(1), { id: DEMO_ME, name: 'あなた', avatar: null }], status: 'going', roomId: DEMO_ROOM_ID, roomName: '📗 Room 1', inviteCode: null },
    { id: 'g2', title: '共通テスト 数学演習', startAt: nextAt(26), durationMins: 90, repeatDays: [], host: P(1), members: [P(1), P(3)], status: 'invited', roomId: DEMO_ROOM_ID, roomName: '📘 Room 2', inviteCode: null },
    { id: 'g3', title: '朝活 30分だけ', startAt: nextAt(10), durationMins: 30, repeatDays: [1, 2, 3, 4, 5], host: { id: DEMO_ME, name: 'あなた', avatar: null }, members: [{ id: DEMO_ME, name: 'あなた', avatar: null }, P(2)], status: 'host', roomId: DEMO_ROOM_ID, roomName: '📙 Room 3', inviteCode: null },
  ],
  friends: [P(0), P(1), P(2)],
  rooms: [{ id: DEMO_ROOM_ID, name: '📗 Room 1' }, { id: 'r2', name: '📘 Room 2' }, { id: 'r3', name: '📙 Room 3' }],
}
export const demoPins = {
  plan: 'free', secretLimit: 3, secretCount: 2,
  myPins: [
    { ...P(1), goal: 'kyotsu', reason: '同じ目標', secret: false, mutual: true, at: now },
    { ...P(3), goal: null, reason: null, secret: true, mutual: false, at: now },
  ],
  pinnedMe: [
    { ...P(1), goal: 'kyotsu', reason: '同じ目標', secret: false, mutual: true, at: now },
    { ...P(2), goal: 'boki', reason: '毎朝いるので刺激になってます！', secret: false, mutual: false, at: now },
  ],
  matches: [ids[1]],
}
