import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import RoomClient from '@/components/room/RoomClient'
import { getMyStats } from '@/lib/studyTime'
import { canEnterRoom, grantRoomAccess, getMyPrivateRooms, listPublicRooms, INVITE_CODE_RE, UUID_RE, MAIN_ROOM_IDS } from '@/lib/roomAccess'

export const dynamic = 'force-dynamic'

export default async function RoomPage({ params, searchParams }: { params: Promise<{ roomId: string }>; searchParams: Promise<{ code?: string }> }) {
  const { roomId } = await params
  const { code } = await searchParams
  const session = await auth()
  if (!session?.user) redirect(`/?next=${encodeURIComponent(`/room/${roomId}`)}`)

  const supabase = await createClient()
  const userId = session.user.id!

  const adminClient = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 自分のプロフィール（is_banned など非公開の列も含む）はサーバー権限で読む
  let { data: profile } = await adminClient.from('profiles').select('*').eq('id', userId).maybeSingle()

  if (!profile) {
    await adminClient.from('profiles').upsert({
      id: userId,
      username: 'user_' + userId.slice(0, 8),
      display_name: session.user.name ?? 'ユーザー',
      avatar_url: session.user.image ?? null,
    })
    const { data } = await adminClient.from('profiles').select('*').eq('id', userId).maybeSingle()
    profile = data
  }

  if (!profile || (profile as any).is_banned) redirect('/banned')

  // プライベートルームは RLS で見えないことがあるので、サーバー側で入室権を確かめてから読む
  const { data: roomRow } = UUID_RE.test(roomId)
    ? await adminClient.from('rooms').select('*').eq('id', roomId).maybeSingle()
    : { data: null }
  const room = roomRow
  if (room?.is_private) {
    // 招待リンク経由の初回ログイン（プロフィール作成前）だった場合はここで権限を付ける
    if (code && INVITE_CODE_RE.test(code) && code.toUpperCase() === room.invite_code) await grantRoomAccess(adminClient, room.id, userId)
    if (!(await canEnterRoom(adminClient, room, userId))) redirect('/lobby?invite=denied')
  }
  // 見つからない部屋・しまった部屋（Room 1〜3 にまとめる前の部屋）は Room 1 へ
  if (!room || (room as any).is_archived) {
    if (roomId !== MAIN_ROOM_IDS[0]) redirect('/room/' + MAIN_ROOM_IDS[0])
    redirect('/lobby')
  }

  const allRooms = await listPublicRooms(adminClient)
  const { data: members } = await supabase.from('room_members').select('*, profiles(display_name, avatar_url, study_streak, subject)').eq('room_id', roomId)
  const { data: friendships } = await supabase.from('friendships').select('*, profiles!friendships_addressee_id_fkey(id, display_name, avatar_url)').eq('requester_id', userId).eq('status', 'accepted')
  const { data: tasks } = await supabase.from('tasks').select('*').eq('user_id', userId).eq('completed', false).order('created_at', { ascending: false }).limit(20)

  const initialStats = await getMyStats(adminClient, userId)
  const myPrivateRooms = await getMyPrivateRooms(adminClient, userId)
  // 招待で入った友達部屋なら、作った人とフレンドになる案内を出すために名前を渡す
  let roomOwner: { id: string; display_name: string } | null = null
  if ((room as any).is_private && (room as any).created_by && (room as any).created_by !== userId) {
    const { data: owner } = await adminClient.from('profiles').select('id, display_name').eq('id', (room as any).created_by).maybeSingle()
    if (owner) roomOwner = { id: owner.id, display_name: owner.display_name }
  }

  return (
    <RoomClient
      profile={JSON.parse(JSON.stringify(profile))}
      room={JSON.parse(JSON.stringify(room))}
      allRooms={JSON.parse(JSON.stringify(allRooms ?? []))}
      initialMembers={JSON.parse(JSON.stringify(members ?? []))}
      initialFriends={JSON.parse(JSON.stringify(friendships ?? []))}
      initialTasks={JSON.parse(JSON.stringify(tasks ?? []))}
      initialStats={initialStats}
      myPrivateRooms={JSON.parse(JSON.stringify(myPrivateRooms))}
      roomOwner={roomOwner}
    />
  )
}
