// app/api/profile/route.ts — 自分のプロフィール（表示名・自己紹介・画像）を更新する
// 画像はブラウザで正方形に縮小してから送られてくる。中身が本当に画像かをここでも確かめてから保存する
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasNgWord } from '@/lib/wordFilter'

const MAX_NAME = 20
const MAX_BIO = 160
const MAX_IMAGE_BYTES = 1024 * 1024

/** ファイル先頭のバイト列から画像形式を判定する（拡張子や Content-Type は信用しない） */
function detectImage(b: Uint8Array): { type: string; ext: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' }
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { type: 'image/png', ext: 'png' }
  if (String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return { type: 'image/webp', ext: 'webp' }
  return null
}

const bad = (error: string) => NextResponse.json({ error }, { status: 400 })

export async function POST(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let form: FormData
  try { form = await request.formData() } catch { return bad('invalid form') }

  const name = String(form.get('display_name') ?? '').trim()
  const bio = String(form.get('bio') ?? '').trim().replace(/\r/g, '').replace(/\n{3,}/g, '\n\n')
  if (!name || name.length > MAX_NAME) return bad('表示名は1〜20文字で入力してください')
  if (bio.length > MAX_BIO) return bad('自己紹介は160文字以内で入力してください')
  if (hasNgWord(name) || hasNgWord(bio)) return bad('不適切な言葉が含まれています')
  // 性別（任意）と Instagram（任意・フレンドとマッチした相手にだけ見える）。送られてこなければ変えない
  const genderRaw = form.get('gender')
  const igRaw = form.get('instagram')
  const gender = genderRaw === null ? undefined : String(genderRaw)
  if (gender !== undefined && !['', 'female', 'male', 'other'].includes(gender)) return bad('性別の指定が正しくありません')
  const instagram = igRaw === null ? undefined : String(igRaw).trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, '')
  if (instagram !== undefined && instagram !== '' && !/^[A-Za-z0-9._]{1,30}$/.test(instagram)) return bad('Instagram のユーザー名は英数字・ピリオド・アンダーバーの30文字までです')

  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles').select('is_banned').eq('id', userId).maybeSingle()
  if (!me || me.is_banned) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const update: { display_name: string; bio: string | null; avatar_url?: string | null } = { display_name: name, bio: bio || null }

  let oldFiles: string[] = []
  const file = form.get('avatar')
  const removeAvatar = form.get('remove_avatar') === '1'
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_IMAGE_BYTES) return bad('画像が大きすぎます（1MBまで）')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const img = detectImage(bytes)
    if (!img) return bad('JPEG・PNG・WebP の画像を選んでください')

    // 新しい名前で保存（同じ名前だとキャッシュで古い画像が出るため）。古い画像はプロフィール更新に成功してから消す
    const { data: old } = await admin.storage.from('avatars').list(userId)
    oldFiles = (old ?? []).map(f => `${userId}/${f.name}`)
    const path = `${userId}/${Date.now()}.${img.ext}`
    const { error } = await admin.storage.from('avatars').upload(path, bytes, { contentType: img.type, cacheControl: '31536000' })
    if (error) { console.error('avatar upload:', error.message); return NextResponse.json({ error: '画像の保存に失敗しました' }, { status: 500 }) }
    update.avatar_url = admin.storage.from('avatars').getPublicUrl(path).data.publicUrl
  } else if (removeAvatar) {
    const { data: old } = await admin.storage.from('avatars').list(userId)
    oldFiles = (old ?? []).map(f => `${userId}/${f.name}`)
    update.avatar_url = null
  }

  const { data, error } = await admin.from('profiles').update(update).eq('id', userId)
    .select('display_name, avatar_url, bio').single()
  if (!error && (gender !== undefined || instagram !== undefined)) {
    const extra: { gender?: string | null; instagram?: string | null } = {}
    if (gender !== undefined) extra.gender = gender || null
    if (instagram !== undefined) extra.instagram = instagram || null
    // migration_rooms_pins.sql 未実行で列が無いときは、ほかの項目の保存は成功させる
    const { error: e2 } = await admin.from('profiles').update(extra).eq('id', userId)
    if (e2) console.error('profile extra update:', e2.message)
  }
  if (error) { console.error('profile update:', error.message); return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 }) }
  if (oldFiles.length) await admin.storage.from('avatars').remove(oldFiles)
  return NextResponse.json({ profile: data })
}
