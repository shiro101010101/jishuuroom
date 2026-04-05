// app/api/admin/ban/route.ts
import { auth } from '@/auth'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()

  // Admin check
  const { data: caller } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  const callerData = caller as { role: string } | null
  if (callerData?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { targetUserId, reason } = body

  if (!targetUserId || !reason) {
    return NextResponse.json({ error: 'targetUserId と reason は必須です' }, { status: 400 })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ is_banned: true, ban_reason: reason })
    .eq('id', targetUserId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: `${targetUserId} をBANしました` })
}
