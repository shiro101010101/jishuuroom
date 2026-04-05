import { auth, signOut } from '@/auth'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function BannedPage() {
  const session = await auth()
  if (!session?.user) redirect('/')

  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('ban_reason')
    .eq('id', session.user.id)
    .single()

  const banReason = (data as { ban_reason?: string | null } | null)?.ban_reason

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'var(--bg2)', border:'2px solid #ef4444', borderRadius:20, padding:'40px 36px', maxWidth:440, width:'100%', textAlign:'center' }}>
        <div style={{ fontSize:64, marginBottom:16 }}>🚫</div>
        <h1 style={{ fontSize:22, fontWeight:700, color:'#ef4444', marginBottom:8 }}>アカウントがBANされました</h1>
        <p style={{ fontSize:13, color:'var(--muted2)', lineHeight:1.7, marginBottom:16 }}>このアカウントは利用規約違反により停止されています。</p>
        {banReason && (
          <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:12, color:'var(--muted2)', textAlign:'left' }}>
            <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>理由</div>
            {banReason}
          </div>
        )}
        <form action={async () => { 'use server'; await signOut({ redirectTo:'/' }) }}>
          <button type="submit" style={{ padding:'10px 24px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, color:'var(--muted2)', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>ログアウト</button>
        </form>
      </div>
    </div>
  )
}
