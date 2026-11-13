-- ============================================================
-- Web Push 通知の購読情報 ＋ 紹介コード（migration_least_privilege.sql の後に実行）
-- 方針（既存のセキュリティ規約どおり）
--   ・push_subscriptions はサーバー専用。書き込み・読み取りとも service_role（サーバーの API）だけが行う
--     ログイン済みユーザー（authenticated）・未ログイン（anon）からは一切触れない
--   ・profiles.referred_code は「誰の紹介で来たか」の内部記録。列の SELECT 権限は付けない（他人からも本人からも見えない）
--   ・新しい関数は作らない（security definer 関数も増やさない）
-- 実行後は必ず supabase/tests/security_audit.sql を流して「✅ 問題なし」を確認すること
-- ============================================================

-- 1. Push 通知の購読（1 端末 = 1 行。endpoint はブラウザごとに一意）
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  endpoint     text not null unique check (char_length(endpoint) <= 1024 and endpoint like 'https://%'),
  p256dh       text not null check (char_length(p256dh) <= 256),
  auth         text not null check (char_length(auth) <= 64),
  created_at   timestamptz not null default now(),
  last_sent_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id, created_at);
create index if not exists push_subscriptions_last_sent_idx on public.push_subscriptions (last_sent_at);

-- RLS は有効。ポリシーは作らない ＝ authenticated からは 1 行も見えない・書けない（service_role は RLS を通らない）
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
revoke all on public.push_subscriptions from authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;

-- 2. 紹介コード（どの紹介リンクから登録したか）。英数字 1〜16 文字だけ
alter table public.profiles add column if not exists referred_code text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_referred_code_format') then
    alter table public.profiles add constraint profiles_referred_code_format
      check (referred_code is null or referred_code ~ '^[A-Za-z0-9]{1,16}$');
  end if;
end $$;
create index if not exists profiles_referred_code_idx on public.profiles (referred_code) where referred_code is not null;

-- profiles は列単位で公開している（migration_privacy.sql）。新しい列には権限を付けない（念のため明示的に外す）
revoke select (referred_code), insert (referred_code), update (referred_code) on public.profiles from authenticated;
revoke all on public.profiles from anon;
