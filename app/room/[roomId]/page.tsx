import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import RoomClient from '@/components/room/RoomClient'

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params
  const session = await auth()
  if (!session?.user) redirect('/')

  const supabase = await createClient()
  const userId = session.user.id!

  const adminClient = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single()

  if (!profile) {
    await adminClient.from('profiles').upsert({
      id: userId,
      username: 'user_' + userId.slice(0, 8),
      display_name: session.user.name ?? 'ユーザー',
      avatar_url: session.user.image ?? null,
    })
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    profile = data
  }

  if (!profile || (profile as any).is_banned) redirect('/banned')

  const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single()
  if (!room) redirect('/room/00000000-0000-0000-0000-000000000001')

  const { data: allRooms } = await supabase.from('rooms').select('*').eq('is_private', false).order('name')
  const { data: members } = await supabase.from('room_members').select('*, profiles(display_name, avatar_url, study_streak, subject)').eq('room_id', roomId)
  const { data: friendships } = await supabase.from('friendships').select('*, profiles!friendships_addressee_id_fkey(id, display_name, avatar_url)').eq('requester_id', userId).eq('status', 'accepted')
  const { data: tasks } = await supabase.from('tasks').select('*').eq('user_id', userId).eq('completed', false).order('created_at', { ascending: false }).limit(20)

  let weeklyStats: { day_of_week: number; total_seconds: number }[] = []
  try {
    const { data } = await supabase.rpc('get_weekly_stats', { target_user_id: userId })
    if (Array.isArray(data)) {
      weeklyStats = data.map((d: any) => ({ day_of_week: Number(d.day_of_week ?? 0), total_seconds: Number(d.total_seconds ?? 0) }))
    }
  } catch {}

  return (
    <RoomClient
      profile={JSON.parse(JSON.stringify(profile))}
      room={JSON.parse(JSON.stringify(room))}
      allRooms={JSON.parse(JSON.stringify(allRooms ?? []))}
      initialMembers={JSON.parse(JSON.stringify(members ?? []))}
      initialFriends={JSON.parse(JSON.stringify(friendships ?? []))}
      initialTasks={JSON.parse(JSON.stringify(tasks ?? []))}
      weeklyStats={weeklyStats}
    />
  )
}
