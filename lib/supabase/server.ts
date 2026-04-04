// lib/supabase/server.ts
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

// サーバーサイド用（cookies不要・service roleで直接アクセス）
export async function createClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
