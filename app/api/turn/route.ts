// app/api/turn/route.ts — カメラ映像の中継サーバー（TURN）の一時的な接続情報を発行する
// 映像を必ず中継サーバー経由にすることで、同じ部屋の人に自分の IP アドレスが伝わらないようにする。
// Cloudflare の API キーはサーバーだけが持ち、ブラウザには短時間だけ使える接続情報を渡す。
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const TTL_SEC = 4 * 60 * 60 // 4 時間（1 回の勉強より長く）

export async function GET() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await createAdminClient().from('profiles').select('is_banned').eq('id', userId).maybeSingle()
  if (!me || me.is_banned) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN
  const headers = { 'Cache-Control': 'no-store' }
  // 未設定なら relay: false を返す（クライアントは「IP を守れない」ことを利用者に表示する）
  if (!keyId || !token) return NextResponse.json({ relay: false, iceServers: [] }, { headers })

  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: TTL_SEC }),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`TURN ${res.status}`)
    const data = await res.json() as { iceServers: { urls: string | string[]; username?: string; credential?: string }[] }
    // 中継（turn:）の行だけを渡す。ブラウザが塞いでいるポート 53 は除く
    const iceServers = (data.iceServers ?? [])
      .filter(s => s.username && s.credential)
      .map(s => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter(u => /^turns?:/.test(u) && !/:53\b/.test(u)) }))
      .filter(s => s.urls.length > 0)
    if (iceServers.length === 0) throw new Error('no turn servers')
    return NextResponse.json({ relay: true, iceServers, expiresAt: Date.now() + TTL_SEC * 1000 }, { headers })
  } catch (e) {
    console.error('turn credentials error:', e)
    return NextResponse.json({ relay: false, iceServers: [], error: 'unavailable' }, { status: 503, headers })
  }
}
