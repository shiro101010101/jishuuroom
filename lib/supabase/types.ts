// lib/supabase/types.ts

export type Profile = {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  provider: string | null
  is_banned: boolean
  ban_reason: string | null
  role: 'user' | 'admin'
  created_at: string
  last_seen: string
  study_streak: number
  total_study_seconds: number
  subject: string | null
  last_study_date: string | null
}

export type Room = {
  id: string
  name: string
  description: string | null
  emoji: string
  category: string
  is_private: boolean
  invite_code: string | null
  max_members: number
  created_by: string | null
  created_at: string
}

export type RoomMember = {
  id: string
  room_id: string
  user_id: string
  status: 'studying' | 'break' | 'away'
  current_task: string | null
  camera_on: boolean
  study_seconds: number
  joined_at: string
  profiles?: { display_name: string; avatar_url: string | null; study_streak?: number; subject?: string }
}

export type Message = {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  is_read: boolean
  created_at: string
}

export type Friendship = {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted' | 'blocked'
  created_at: string
  profiles?: Profile
}

export type StudySession = {
  id: string
  user_id: string
  room_id: string
  started_at: string
  ended_at: string | null
  duration_seconds: number
  pomodoros_completed: number
}

export type Task = {
  id: string
  user_id: string
  title: string
  completed: boolean
  completed_at: string | null
  is_shared: boolean
  share_scope: string | null
  created_at: string
}

export type WebRTCSignal = {
  id: string
  room_id: string
  sender_id: string
  receiver_id: string
  signal_type: string
  payload: string
  created_at: string
}

export type Report = {
  id: string
  reporter_id: string
  reported_id: string
  reason: string
  details: string | null
  created_at: string
}

export type Reaction = {
  id: string
  sender_id: string
  receiver_id: string
  room_id: string
  emoji: string
  created_at: string
}

export type Pin = {
  id: string
  pinner_id: string
  pinned_id: string
  created_at: string
}

export type DailyMessage = {
  id: string
  user_id: string
  room_id: string
  content: string
  created_at: string
  date: string
}

export type ScheduledSession = {
  id: string
  host_id: string
  room_id: string
  title: string
  subject: string | null
  scheduled_at: string
  duration_mins: number
  max_members: number
  created_at: string
}

export type SessionParticipant = {
  id: string
  session_id: string
  user_id: string
  joined_at: string
}

export type Block = {
  id: string
  blocker_id: string
  blocked_id: string
  created_at: string
}

// Supabase Database type
export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> }
      rooms: { Row: Room; Insert: Partial<Room>; Update: Partial<Room> }
      room_members: { Row: RoomMember; Insert: Partial<RoomMember>; Update: Partial<RoomMember> }
      messages: { Row: Message; Insert: Partial<Message>; Update: Partial<Message> }
      friendships: { Row: Friendship; Insert: Partial<Friendship>; Update: Partial<Friendship> }
      study_sessions: { Row: StudySession; Insert: Partial<StudySession>; Update: Partial<StudySession> }
      tasks: { Row: Task; Insert: Partial<Task>; Update: Partial<Task> }
      webrtc_signals: { Row: WebRTCSignal; Insert: Partial<WebRTCSignal>; Update: Partial<WebRTCSignal> }
      reports: { Row: Report; Insert: Partial<Report>; Update: Partial<Report> }
      reactions: { Row: Reaction; Insert: Partial<Reaction>; Update: Partial<Reaction> }
      pins: { Row: Pin; Insert: Partial<Pin>; Update: Partial<Pin> }
      daily_messages: { Row: DailyMessage; Insert: Partial<DailyMessage>; Update: Partial<DailyMessage> }
      scheduled_sessions: { Row: ScheduledSession; Insert: Partial<ScheduledSession>; Update: Partial<ScheduledSession> }
      session_participants: { Row: SessionParticipant; Insert: Partial<SessionParticipant>; Update: Partial<SessionParticipant> }
      blocks: { Row: Block; Insert: Partial<Block>; Update: Partial<Block> }
      banned_providers: { Row: { id: string; provider: string; provider_id: string }; Insert: Partial<{ id: string; provider: string; provider_id: string }>; Update: Partial<{ id: string; provider: string; provider_id: string }> }
      study_pairs: { Row: { id: string; user1_id: string; user2_id: string; status: string }; Insert: Partial<{ id: string; user1_id: string; user2_id: string; status: string }>; Update: Partial<{ id: string; user1_id: string; user2_id: string; status: string }> }
    }
  }
}
