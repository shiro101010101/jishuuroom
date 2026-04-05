import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const supabase = await createClient()

  const { data } = await supabase
    .from('rooms')
    .select('id')
    .eq('invite_code', code)
    .single()

  const room = data as { id: string } | null

  if (!room?.id) redirect('/')
  redirect(`/room/${room.id}`)
}
