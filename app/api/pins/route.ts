// app/api/pins/route.ts — ピン（気になる勉強仲間）
//   GET    自分のピン・自分をピンした人（ひみつのピンはマッチするまで人数だけ）・マッチ
//   POST   ピンする／理由・ひみつを変える { targetId, reason?, secret? }
//          お互いにピンしたら「マッチ」→ 二人をフレンドにして、両方へ通知（初めてのマッチのときだけ）
//   DELETE ピンを外す { targetId }
// ブロックしている／されている相手にはピンできない。ブロックするとピン・マッチは DB のトリガーで消える
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasNgWord } from '@/lib/wordFilter'
import { UUID_RE, sharesRoomNow } from '@/lib/roomAccess'
import { pushToUsers } from '@/lib/studyGroupsServer'
import { getPlan, LIMITS } from '@/lib/premium'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_PINS = 200
/** 新しくピンできる人数（24 時間あたり）。知らない人への大量ピン・通知の連打を防ぐ */
const MAX_NEW_PINS_PER_DAY = 30
/**
 * 連絡先の交換に使われやすい書き方（理由欄には書けない）。NFKC で正規化してから調べる
 * 「合格ライン」「オンライン」「ガイドライン」「TOEIC 800」などの普通の言葉は止めないように、言葉の区切りと並びで判定する
 */
const CONTACT_RES: RegExp[] = [
  /https?:\/\/|www\.|\.(com|jp|net|me|io)\b/i,
  /[@＠]\s*[a-z0-9_.]/i,
  /\b(line|insta(gram)?|twitter|discord|kakao|tiktok|telegram|snapchat|skype|gmail|e-?mail|mail)\b/i,
  /\b(dm|id)\b\s*[:：は]?/i,
  /(ライン|らいん|ﾗｲﾝ)(交換|こうかん|id|やって|教え|おしえ|追加|ついか|しよ|ちょうだい|ください|で連絡|送って|おくって)/i,
  /インスタ|ツイッター|ディスコード|カカオ|ティックトック|でぃーえむ|メアド|メールアドレス|メール(交換|教え|ください|して)|電話番号|連絡先/,
  /(?<!\d)0\d{1,4}[-ー－\s]?\d{1,4}[-ー－\s]?\d{3,4}(?!\d)/, // 電話番号らしい並び
]
const hasContact = (t: string) => {
  const n = t.normalize('NFKC')
  // 「L I N E」「ラ イ ン」のように間をあけた書き方も見る
  const compact = n.replace(/[\s・._\-]/g, '')
  return CONTACT_RES.some(re => re.test(n) || re.test(compact))
}
const MAX_REASON = 50
/** 同じ人に「ピンされました」を知らせる間隔（付け外しで何度も通知が飛ばないように） */
const NOTICE_INTERVAL_MS = 7 * 86_400_000

const bad = (error: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status })

async function ctx() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return null
  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles').select('display_name, is_banned').eq('id', userId).maybeSingle()
  return { admin, userId, name: (me?.display_name as string) ?? '', banned: !me || !!me.is_banned }
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const text = await request.text()
    if (text.length > 2048) return {}
    const v = JSON.parse(text)
    return v && typeof v === 'object' ? v : {}
  } catch { return {} }
}

async function blockedBetween(admin: ReturnType<typeof createAdminClient>, a: string, b: string) {
  const { data } = await admin.from('blocks').select('blocker_id')
    .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`).limit(1)
  return (data ?? []).length > 0
}

type PinRow = { pinner_id: string; pinned_id: string; reason: string | null; is_secret: boolean; created_at: string }

export async function GET() {
  const c = await ctx()
  if (!c) return bad('Unauthorized', 401)
  if (c.banned) return bad('Forbidden', 403)
  const { admin, userId } = c

  const [mine, toMe, blocks, plan] = await Promise.all([
    admin.from('pins').select('pinner_id, pinned_id, reason, is_secret, created_at').eq('pinner_id', userId).order('created_at', { ascending: false }).limit(MAX_PINS),
    admin.from('pins').select('pinner_id, pinned_id, reason, is_secret, created_at').eq('pinned_id', userId).order('created_at', { ascending: false }).limit(500),
    admin.from('blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
    getPlan(admin, userId),
  ])
  if (mine.error) return bad('ピンを読み込めませんでした（データベースの更新が必要かもしれません）', 500)

  const blocked = new Set((blocks.data ?? []).map(b => (b.blocker_id === userId ? b.blocked_id : b.blocker_id) as string))
  const myPins = ((mine.data ?? []) as PinRow[]).filter(p => !blocked.has(p.pinned_id))
  const pinsToMe = ((toMe.data ?? []) as PinRow[]).filter(p => !blocked.has(p.pinner_id))
  const iPin = new Set(myPins.map(p => p.pinned_id))
  // ひみつのピンは、自分もピンし返すまで誰からかは見せない（人数だけ）
  const visibleToMe = pinsToMe.filter(p => !p.is_secret || iPin.has(p.pinner_id))
  // ひみつのピンの件数は、ブロック関係の人の分も含めて数える（ブロックして件数が減るかで送り主を割り出せないように）
  const secretCount = ((toMe.data ?? []) as PinRow[]).filter(p => p.is_secret && !iPin.has(p.pinner_id)).length
  const mutual = new Set(pinsToMe.filter(p => iPin.has(p.pinner_id)).map(p => p.pinner_id))

  const ids = [...new Set([...myPins.map(p => p.pinned_id), ...visibleToMe.map(p => p.pinner_id)])]
  const { data: people } = ids.length
    ? await admin.from('profiles').select('id, display_name, avatar_url, goal_exam').in('id', ids)
    : { data: [] }
  const person = new Map((people ?? []).map(p => [p.id as string, { id: p.id as string, name: (p.display_name as string) ?? '', avatar: (p.avatar_url as string | null) ?? null, goal: (p.goal_exam as string | null) ?? null }]))
  const unknown = (id: string) => ({ id, name: '', avatar: null, goal: null })

  return NextResponse.json({
    plan,
    secretLimit: LIMITS[plan].secretPins,
    myPins: myPins.map(p => ({ ...(person.get(p.pinned_id) ?? unknown(p.pinned_id)), reason: p.reason, secret: p.is_secret, mutual: mutual.has(p.pinned_id), at: p.created_at })),
    pinnedMe: visibleToMe.map(p => ({ ...(person.get(p.pinner_id) ?? unknown(p.pinner_id)), reason: p.reason, secret: p.is_secret, mutual: mutual.has(p.pinner_id), at: p.created_at })),
    secretCount,
    matches: [...mutual],
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const c = await ctx()
  if (!c) return bad('Unauthorized', 401)
  if (c.banned) return bad('Forbidden', 403)
  const { admin, userId, name } = c
  const body = await readBody(request)

  const targetId = body.targetId
  if (typeof targetId !== 'string' || !UUID_RE.test(targetId) || targetId === userId) return bad('invalid request')
  const reason = typeof body.reason === 'string' ? body.reason.trim().replace(/\s+/g, ' ') : ''
  if (reason.length > MAX_REASON) return bad(`理由は${MAX_REASON}文字までです`)
  if (reason && hasNgWord(reason)) return bad('不適切な言葉が含まれています')
  if (hasContact(reason)) return bad('理由に連絡先・SNS・URL は書けません')
  const secret = body.secret === true

  const { data: target } = await admin.from('profiles').select('id, display_name, is_banned').eq('id', targetId).maybeSingle()
  if (!target || target.is_banned) return bad('この人はピンできません', 404)
  if (await blockedBetween(admin, userId, targetId)) return bad('この人はピンできません', 403)

  const { data: existing } = await admin.from('pins').select('id, is_secret').eq('pinner_id', userId).eq('pinned_id', targetId).maybeSingle()
  if (!existing) {
    const since = new Date(Date.now() - 86_400_000).toISOString()
    const [{ count }, { count: today, error: todayErr }] = await Promise.all([
      admin.from('pins').select('id', { count: 'exact', head: true }).eq('pinner_id', userId),
      // ピンを付けた記録で数える（外しても減らない。付け外しの繰り返しで上限をすり抜けられないように）
      admin.from('pin_events').select('id', { count: 'exact', head: true }).eq('pinner_id', userId).gte('created_at', since),
    ])
    if ((count ?? 0) >= MAX_PINS) return bad(`ピンは${MAX_PINS}人までです。使わないピンを外してください`)
    // 数えられないとき（DB 更新前など）は上限に達した扱いにする（すり抜けさせない）
    if (todayErr || (today ?? 0) >= MAX_NEW_PINS_PER_DAY) return bad(`新しくピンできるのは1日${MAX_NEW_PINS_PER_DAY}人までです。また明日どうぞ`, 429)
    // ピンできるのは「今同じ部屋にいる人」「フレンド」「自分をピンしてくれた人（ピンを返す）」だけ
    const [together, { data: friend }, { data: pinnedMe }] = await Promise.all([
      sharesRoomNow(admin, userId, targetId),
      admin.from('friendships').select('id').eq('requester_id', userId).eq('addressee_id', targetId).eq('status', 'accepted').maybeSingle(),
      // ひみつのピンは数えない（ピンできるかどうかで、ひみつのピンがばれないように）
      admin.from('pins').select('id').eq('pinner_id', targetId).eq('pinned_id', userId).eq('is_secret', false).maybeSingle(),
    ])
    if (!together && !friend && !pinnedMe) return bad('ピンできるのは、同じ部屋で勉強している人・フレンド・あなたをピンした人です', 403)
  }
  if (secret && !existing?.is_secret) {
    const plan = await getPlan(admin, userId)
    const { count } = await admin.from('pins').select('id', { count: 'exact', head: true }).eq('pinner_id', userId).eq('is_secret', true)
    if ((count ?? 0) >= LIMITS[plan].secretPins) {
      return bad(plan === 'free'
        ? `無料プランのひみつのピンは${LIMITS.free.secretPins}人までです。プレミアムなら${LIMITS.premium.secretPins}人までひみつにできます`
        : 'ひみつのピンが多すぎます', 403, { upgrade: plan === 'free' })
    }
  }

  const { error } = await admin.from('pins').upsert(
    { pinner_id: userId, pinned_id: targetId, reason: reason || null, is_secret: secret },
    { onConflict: 'pinner_id,pinned_id' },
  )
  if (error) { console.error('pin upsert error:', error); return bad('ピンできませんでした（データベースの更新が必要かもしれません）', 500) }
  if (!existing) {
    const { error: evErr } = await admin.from('pin_events').insert({ pinner_id: userId, pinned_id: targetId })
    if (evErr) console.error('pin_events insert error:', evErr.message)
  }

  // お互いにピンした？
  const { data: back } = await admin.from('pins').select('is_secret').eq('pinner_id', targetId).eq('pinned_id', userId).maybeSingle()
  const mutual = !!back
  let firstMatch = false
  if (mutual) {
    const [a, b] = userId < targetId ? [userId, targetId] : [targetId, userId]
    const { data: inserted } = await admin.from('pin_matches').upsert({ user_a: a, user_b: b }, { onConflict: 'user_a,user_b', ignoreDuplicates: true }).select('user_a')
    firstMatch = (inserted ?? []).length > 0
    if (firstMatch) {
      // マッチしたらフレンドに（メッセージ・Instagram が見られるようになる）。ブロック中の行は上書きしない
      const { data: rows } = await admin.from('friendships').select('requester_id, addressee_id, status')
        .or(`and(requester_id.eq.${userId},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${userId})`)
      if (!(rows ?? []).some(r => r.status === 'blocked')) {
        await admin.from('friendships').upsert([
          { requester_id: userId, addressee_id: targetId, status: 'accepted' },
          { requester_id: targetId, addressee_id: userId, status: 'accepted' },
        ], { onConflict: 'requester_id,addressee_id' })
      }
      await Promise.all([
        pushToUsers(admin, [targetId], {
          title: '🤝 勉強仲間とマッチしました！',
          body: back.is_secret
            ? `ひみつのピンが届いていました。実は${name}さんも、あなたをピンしていました`
            : `${name}さんがピンを返しました。一緒にがんばろう！`,
          url: '/lobby#pins', tag: `match-${userId}`.slice(0, 64),
        }),
        pushToUsers(admin, [userId], {
          title: '🤝 勉強仲間とマッチしました！',
          body: back.is_secret
            ? `実は${target.display_name}さんも、ひみつであなたをピンしていました`
            : `${target.display_name}さんとお互いにピンしました。メッセージを送れます`,
          url: '/lobby#pins', tag: `match-${targetId}`.slice(0, 64),
        }),
      ])
    }
  } else if (!secret && !existing) {
    // 公開ピン：相手に「ピンされました」（同じ人からは 7 日に 1 回まで）
    const { data: notice } = await admin.from('pin_notices').select('notified_at').eq('pinner_id', userId).eq('pinned_id', targetId).maybeSingle()
    if (!notice || Date.now() - new Date(notice.notified_at).getTime() > NOTICE_INTERVAL_MS) {
      await admin.from('pin_notices').upsert({ pinner_id: userId, pinned_id: targetId, notified_at: new Date().toISOString() }, { onConflict: 'pinner_id,pinned_id' })
      await pushToUsers(admin, [targetId], {
        title: '📌 あなたをピンした人がいます',
        body: `${name}さんが、あなたを勉強仲間としてピンしました。ロビーで理由を見られます`,
        url: '/lobby#pins', tag: 'pinned',
      })
    }
  }

  return NextResponse.json({ pinned: true, mutual, firstMatch, revealedSecret: mutual && !!back?.is_secret, targetName: target.display_name })
}

export async function DELETE(request: Request) {
  const c = await ctx()
  if (!c) return bad('Unauthorized', 401)
  const body = await readBody(request)
  const targetId = body.targetId
  if (typeof targetId !== 'string' || !UUID_RE.test(targetId)) return bad('invalid request')
  const { error } = await c.admin.from('pins').delete().eq('pinner_id', c.userId).eq('pinned_id', targetId)
  if (error) return bad('外せませんでした', 500)
  return NextResponse.json({ pinned: false })
}
