// app/demo/room — 開発中だけ開ける「自習室の見た目確認」ページ（ログイン不要・ダミーデータ）
// 本番では 404。開発中と Vercel のプレビュー（PR の試用 URL）でだけ開ける
import { notFound } from 'next/navigation'
import RoomClient from '@/components/room/RoomClient'
import { demoFriends, demoMembers, demoProfile, demoRooms, demoStats, demoTasks } from '@/lib/demoData'

export const dynamic = 'force-dynamic'

export default function DemoRoomPage() {
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'preview') notFound()
  return (
    <RoomClient
      profile={demoProfile as any}
      room={demoRooms[0] as any}
      allRooms={demoRooms as any}
      initialMembers={demoMembers as any}
      initialFriends={demoFriends as any}
      initialTasks={demoTasks as any}
      initialStats={demoStats}
      myPrivateRooms={[]}
    />
  )
}
