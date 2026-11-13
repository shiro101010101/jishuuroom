// app/demo/lobby — 開発中だけ開ける「ロビーの見た目確認」ページ（ログイン不要・ダミーデータ）
// 本番では 404。開発中と Vercel のプレビュー（PR の試用 URL）でだけ開ける
import { notFound } from 'next/navigation'
import LobbyView from '@/components/lobby/LobbyView'
import { DEMO_ME, demoRooms, demoStats, demoTop } from '@/lib/demoData'

export const dynamic = 'force-dynamic'

export default function DemoLobbyPage() {
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'preview') notFound()
  const counts = { [demoRooms[0].id]: { total: 4, studying: 3 }, [demoRooms[1].id]: { total: 2, studying: 2 } }
  return (
    <LobbyView
      name="あなた（デモ）" avatarUrl={null} bio={null} needsGoal={false}
      stats={demoStats} quickRoom={demoRooms[0]} firstTime={false} counts={counts}
      privateRooms={[{ id: '00000000-0000-4000-8000-0000000000b1', name: 'いつもの3人', description: '友達だけの部屋', emoji: '🌙' }]}
      rooms={demoRooms} top={demoTop} userId={DEMO_ME} demo
    />
  )
}
