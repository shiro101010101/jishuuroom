// app/room/[roomId]/page.tsx
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RoomClient from '@/components/room/RoomClient'

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>
}) {
  const { roomId } = await params
  const session = await auth()
  if (!session?.user) redirect('/')

  const supabase = await createClient()
  const userId = session.user.id!

  // プロフィール取得
  let { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (!profile) {
    const { data: newProfile } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        username: 'user_' + userId.slice(0, 8),
        display_name: session.user.name ?? 'ユーザー',
        avatar_url: session.user.image ?? null,
      })
      .select()
      .single()
    profile = newProfile
  }

  if (!profile || profile.is_banned) redirect('/banned')

  // ルーム取得
  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single()

  if (!room) redirect('/room/00000000-0000-0000-0000-000000000001')

  // 全ルーム
  const { data: allRooms } = await supabase
    .from('rooms')
    .select('*')
    .eq('is_private', false)
    .order('name')

  // ルームメンバー（subject と study_streak も取得）
  const { data: members } = await supabase
    .from('room_members')
    .select('*, profiles(display_name, avatar_url, study_streak, subject)')
    .eq('room_id', roomId)

  // フレンド
  const { data: friendships } = await supabase
    .from('friendships')
    .select('*, profiles!friendships_addressee_id_fkey(id, display_name, avatar_url)')
    .eq('requester_id', userId)
    .eq('status', 'accepted')

  // タスク
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('completed', false)
    .order('created_at', { ascending: false })
    .limit(20)

  // 週間統計 - RPCが失敗してもクラッシュしないように
  let weeklyStats: { day_of_week: number; total_seconds: number }[] = []
  try {
    const { data } = await supabase
      .rpc('get_weekly_stats', { target_user_id: userId })
    // RPC returns various types - normalize to plain objects
    if (Array.isArray(data)) {
      weeklyStats = data.map((d: Record<string, unknown>) => ({
        day_of_week: Number(d.day_of_week ?? 0),
        total_seconds: Number(d.total_seconds ?? 0),
      }))
    }
  } catch (e) {
    console.error('Weekly stats error:', e)
  }

  // Serialize profile to plain object to avoid "frame.join is not a function"
  const serializedProfile = JSON.parse(JSON.stringify(profile))
  const serializedRoom = JSON.parse(JSON.stringify(room))
  const serializedAllRooms = JSON.parse(JSON.stringify(allRooms ?? []))
  const serializedMembers = JSON.parse(JSON.stringify(members ?? []))
  const serializedFriendships = JSON.parse(JSON.stringify(friendships ?? []))
  const serializedTasks = JSON.parse(JSON.stringify(tasks ?? []))

  return (
    <RoomClient
      profile={serializedProfile}
      room={serializedRoom}
      allRooms={serializedAllRooms}
      initialMembers={serializedMembers}
      initialFriends={serializedFriendships}
      initialTasks={serializedTasks}
      weeklyStats={weeklyStats}
    />
  )
}
