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
  joined_at: string
  camera_on: boolean
  status: 'studying' | 'break' | 'away'
  current_task: string | null
  study_seconds: number
  profiles?: Profile
}

export type Message = {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  is_read: boolean
  created_at: string
  sender?: Profile
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
  room_id: string | null
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  pomodoros_completed: number
  tasks_completed: number
}

export type Task = {
  id: string
  user_id: string
  title: string
  completed: boolean
  created_at: string
  completed_at: string | null
}

export type WebRTCSignal = {
  id: string
  room_id: string
  from_user: string
  to_user: string
  type: 'offer' | 'answer' | 'ice-candidate'
  payload: Record<string, unknown>
  created_at: string
}

export type Report = {
  id: string
  reporter_id: string
  reported_id: string
  reason: string
  details: string | null
  status: 'pending' | 'reviewed' | 'actioned'
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
    }
  }
}
