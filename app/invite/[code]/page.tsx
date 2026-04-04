// app/invite/[code]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/?invite=${code}`)

  // Find room by invite code
  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('invite_code', code)
    .single()

  if (!room) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <h2 style={{ marginBottom: 8 }}>招待リンクが無効です</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>リンクが期限切れか、無効になっています。</p>
          <a href="/" style={{ display: 'inline-block', marginTop: 16, color: 'var(--accent)' }}>ホームに戻る</a>
        </div>
      </div>
    )
  }

  // Redirect to room
  redirect(`/room/${room.id}`)
}
