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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((caller as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { targetUserId, reason } = body

  if (!targetUserId || !reason) {
    return NextResponse.json({ error: 'targetUserId と reason は必須です' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('profiles')
    .update({ is_banned: true, ban_reason: reason })
    .eq('id', targetUserId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: `${targetUserId} をBANしました` })
}