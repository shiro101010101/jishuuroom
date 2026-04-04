// auth.ts
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Line from 'next-auth/providers/line'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

      console.log('🔐 signIn called:', { provider, providerId, userId: user.id, userName: user.name })

      // BANチェック
      const { data: banned } = await supabaseAdmin
        .from('banned_providers')
        .select('id')
        .eq('provider', provider)
        .eq('provider_id', providerId)
        .maybeSingle()

      if (banned) {
        console.log('🚫 Banned provider detected')
        return '/banned?reason=provider'
      }

      // プロフィールIDを生成（provider + providerId から一意なIDを作る）
      // NextAuthのuser.idはセッション用なので、Supabaseには別のIDを使う
      const profileId = user.id

      console.log('📝 Creating/updating profile with id:', profileId)

      const username = (
        (user.name ?? 'user')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .slice(0, 16) || 'user'
      ) + '_' + providerId.slice(-6)

      const { error } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: profileId,
          username,
          display_name: user.name ?? 'ユーザー',
          avatar_url:   user.image ?? null,
          provider,
          provider_id:  providerId,
          is_banned:    false,
        }, { onConflict: 'id' })

      if (error) {
        console.error('❌ Profile upsert error:', error)
        // エラーでもログインは続行（プロフィールは後で作る）
      } else {
        console.log('✅ Profile created/updated successfully')
      }

      return true
    },

    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id
        token.provider = account?.provider
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

  session: { strategy: 'jwt' },

  debug: true, // 開発中はデバッグON
})
