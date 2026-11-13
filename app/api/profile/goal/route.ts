// app/api/profile/goal/route.ts — 自分の「目標の試験」（profiles.goal_exam）を設定する
// 値は lib/exams.ts の一覧だけ。書き込みはここ（service_role）からだけ行う
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isExamSlug } from '@/lib/exams'

export async function POST(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }) }
  const goal = (body as { goal?: unknown } | null)?.goal
  // null は「目標を外す」
  if (goal !== null && !isExamSlug(goal)) return NextResponse.json({ error: '目標を一覧から選んでください' }, { status: 400 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles').select('is_banned').eq('id', userId).maybeSingle()
  if (!me || me.is_banned) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await admin.from('profiles').update({ goal_exam: goal }).eq('id', userId)
  if (error) {
    console.error('goal update:', error.message)
    return NextResponse.json({ error: '保存に失敗しました（migration_exam.sql を実行してください）' }, { status: 500 })
  }
  return NextResponse.json({ goal })
}
