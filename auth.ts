// auth.ts
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Line from 'next-auth/providers/line'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getReferralCode, normalizeReferralCode, REFERRAL_COOKIE } from '@/lib/referral'

/** 新規登録時：紹介 Cookie があれば、紹介コードを profiles.referred_code に記録する（失敗してもログインは止めない） */
async function recordSignup(profileId: string, provider: string) {
  try {
    const store = await cookies()
    const ref = normalizeReferralCode(store.get(REFERRAL_COOKIE)?.value)
    if (ref && ref !== (await getReferralCode(profileId))) {
      const { error } = await admin().from('profiles').update({ referred_code: ref }).eq('id', profileId).is('referred_code', null)
      if (error) console.error('referral save error:', error.message)
    }
    if (ref) store.delete(REFERRAL_COOKIE)
  } catch {}
  // 新規登録の計測（Vercel 上だけ。個人情報は送らない）
  if (process.env.VERCEL) {
    try {
      const { track } = await import('@vercel/analytics/server')
      await track('signup_complete', { provider: provider === 'line' ? 'line' : provider === 'google' ? 'google' : 'other' })
    } catch {}
  }
}

// サーバー用の Supabase 接続は、ログイン処理で初めて必要になったときに作る
// （鍵が未設定でも、ログイン不要のページは表示できるようにするため）
let _admin: SupabaseClient | null = null
function admin() {
  return (_admin ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!))
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: { params: { prompt: 'select_account' } },
    }),
    Line({
      clientId: process.env.LINE_CLIENT_ID!,
      clientSecret: process.env.LINE_CLIENT_SECRET!,
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (!account || !user) return false

      const providerId = account.providerAccountId
      const provider  = account.provider

      // BANチェック
      const { data: banned } = await admin()
        .from('banned_providers')
        .select('id')
        .eq('provider', provider)
        .eq('provider_id', providerId)
        .maybeSingle()

      if (banned) {
        console.log('🚫 Banned provider detected')
        // /banned はセッション必須なので、ここではログイン画面にエラー表示で戻す
        return '/?error=banned'
      }

      // 注意: Auth.js v5（アダプターなし）の user.id はログインのたびに新しいランダム UUID になる。
      // そのまま使うと毎回別人扱いになり、フレンド・DM・勉強記録が消える（2回目以降は
      // provider_id の一意制約で upsert も失敗する）。そこで provider_id で既存プロフィールを探し、
      // あればその ID を使う。無ければ新規作成する。
      const { data: existing, error: findError } = await admin()
        .from('profiles')
        .select('id')
        .eq('provider', provider)
        .eq('provider_id', providerId)
        .maybeSingle()

      if (findError) {
        console.error('❌ Profile lookup error:', findError)
        return false
      }

      if (existing) {
        // 既存ユーザー: 表示名・画像（本人が編集したもの）や BAN 状態は上書きしない
        user.id = existing.id
        return true
      }

      const baseUsername = (
        (user.name ?? 'user')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .slice(0, 16) || 'user'
      ) + '_' + providerId.slice(-6)

      const profileId = user.id ?? crypto.randomUUID()
      for (let attempt = 0; attempt < 3; attempt++) {
        const username = attempt === 0 ? baseUsername : baseUsername + '_' + crypto.randomUUID().slice(0, 4)
        const { error } = await admin()
          .from('profiles')
          .insert({
            id: profileId,
            username,
            display_name: user.name ?? 'ユーザー',
            avatar_url:   user.image ?? null,
            provider,
            provider_id:  providerId,
            is_banned:    false,
          })
        if (!error) break
        // 23505 = 一意制約違反（username の重複ならリトライ。同時ログインで provider_id が先に入った場合は下で拾う）
        if (error.code !== '23505') {
          console.error('❌ Profile insert error:', error)
          return false
        }
        const { data: raced } = await admin()
          .from('profiles').select('id').eq('provider', provider).eq('provider_id', providerId).maybeSingle()
        if (raced) { user.id = raced.id; return true }
        if (attempt === 2) {
          console.error('❌ Profile insert error:', error)
          return false
        }
      }
      user.id = profileId
      await recordSignup(profileId, provider)

      return true
    },

    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id
        token.provider = account?.provider
        // 念のため provider_id から本当のプロフィール ID を引き直す（signIn での上書きが効かなかった場合の保険）
        if (account?.providerAccountId) {
          const { data } = await admin()
            .from('profiles').select('id').eq('provider', account.provider).eq('provider_id', account.providerAccountId).maybeSingle()
          if (data?.id) token.id = data.id
        }
        token.sub = token.id as string
        token.checkedAt = Date.now()
      }
      // 10 分ごとに BAN されていないか確かめ、BAN されていたらログイン状態を無効にする
      if (token.id && (!token.checkedAt || Date.now() - (token.checkedAt as number) > 10 * 60_000)) {
        const { data } = await admin().from('profiles').select('is_banned').eq('id', token.id as string).maybeSingle()
        if (!data || data.is_banned) return null
        token.checkedAt = Date.now()
      }
      return token
    },

    async session({ session, token }) {
      if (token.id) session.user.id = token.id as string
      return session
    },
  },

  pages: {
    signIn: '/',
    error:  '/?error=auth',
  },

  // ログイン状態は最長 14 日（毎日使っていれば自動で延長される）
  session: { strategy: 'jwt', maxAge: 14 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },

  debug: process.env.NODE_ENV !== 'production',
})
