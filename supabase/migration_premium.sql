-- ============================================================
-- プレミアム（Stripe のサブスク）。migration_rooms_pins.sql の後に実行。何度実行しても大丈夫
-- どちらのテーブルもサーバー専用（service_role だけ）。ブラウザからは読めない・書けない
-- 実行後は supabase/tests/security_audit.sql を流して「✅ 問題なし」を確認すること
-- ============================================================

-- 課金状態（1 人 1 行）。Stripe の Webhook（/api/billing/webhook）が更新する
create table if not exists public.subscriptions (
  user_id                uuid primary key references public.profiles(id) on delete cascade,
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  status                 text not null default 'incomplete',
  plan_interval          text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  updated_at             timestamptz not null default now()
);

-- 申し込み時の同意の記録（生年月日・未成年なら保護者の同意）
create table if not exists public.billing_consents (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  birth_date       date not null,
  is_minor         boolean not null,
  guardian_consent boolean,
  plan_interval    text not null check (plan_interval in ('monthly', 'yearly')),
  created_at       timestamptz not null default now()
);
create index if not exists billing_consents_user_idx on public.billing_consents (user_id, created_at);

alter table public.subscriptions enable row level security;
alter table public.billing_consents enable row level security;
revoke all on public.subscriptions from anon, authenticated;
revoke all on public.billing_consents from anon, authenticated;
grant select, insert, update, delete on public.subscriptions to service_role;
grant select, insert, update, delete on public.billing_consents to service_role;
