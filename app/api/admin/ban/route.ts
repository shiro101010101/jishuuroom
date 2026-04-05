// app/api/admin/ban/route.ts
import { auth } from '@/auth'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { targetUserId, reason } = body

  if (!targetUserId || !reason) {
    return NextResponse.json({ error: 'targetUserId と reason は必須です' }, { status: 400 })
  }

  // Use server client with service role to bypass type issues
  const { createClient: createSupabase } = await import('@supabase/supabase-js')
  const adminClient = createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Admin check
  const { data: caller } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (!caller || (caller as Record<string, string>).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Ban user
  const { error } = await adminClient
    .from('profiles')
    .update({ is_banned: true, ban_reason: reason } as Record<string, unknown>)
    .eq('id', targetUserId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}