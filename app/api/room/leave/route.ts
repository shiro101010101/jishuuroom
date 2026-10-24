// app/api/room/leave/route.ts — 退室（タブを閉じたときは sendBeacon から呼ばれる）
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let roomId: string | undefined
  try { roomId = JSON.parse(await request.text()).roomId } catch {}
  if (!roomId || !UUID_RE.test(roomId)) return NextResponse.json({ error: 'roomId required' }, { status: 400 })

  await createAdminClient().from('room_members').delete().eq('room_id', roomId).eq('user_id', userId)
  return NextResponse.json({ ok: true })
}
