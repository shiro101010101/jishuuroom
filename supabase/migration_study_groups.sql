-- ============================================================
-- 友達との勉強会：定期開催・フレンド招待・開始前通知（migration_push_referral.sql の後に実行）
-- 方針（既存のセキュリティ規約どおり）
--   ・新しいテーブル session_invites はサーバー専用（service_role だけが読み書き）。RLS 有効・ポリシーなし
--   ・scheduled_sessions に列を足すだけ。既存のポリシー（主催者だけが変更できる）はそのまま
--   ・新しい関数は作らない
-- 実行後は supabase/tests/security_audit.sql を流して「✅ 問題なし」を確認すること
-- ============================================================

-- 1. 繰り返し（JST の曜日 0=日〜6=土。空 = 1 回だけ）と、開始前通知を送った回
alter table public.scheduled_sessions add column if not exists repeat_days smallint[] not null default '{}';
alter table public.scheduled_sessions add column if not exists reminded_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'scheduled_sessions_repeat_days_check') then
    alter table public.scheduled_sessions add constraint scheduled_sessions_repeat_days_check
      check (cardinality(repeat_days) <= 7 and repeat_days <@ array[0,1,2,3,4,5,6]::smallint[]);
  end if;
end $$;
create index if not exists scheduled_sessions_scheduled_at_idx on public.scheduled_sessions (scheduled_at);
create index if not exists scheduled_sessions_host_idx on public.scheduled_sessions (host_id);
create index if not exists session_participants_user_idx on public.session_participants (user_id);

-- 2. 勉強会への招待（招待中 / 辞退）。参加すると行は消え、session_participants に入る
create table if not exists public.session_invites (
  session_id uuid not null references public.scheduled_sessions(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'invited' check (status in ('invited', 'declined')),
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
create index if not exists session_invites_user_idx on public.session_invites (user_id);

alter table public.session_invites enable row level security;
revoke all on public.session_invites from anon;
revoke all on public.session_invites from authenticated;
grant select, insert, update, delete on public.session_invites to service_role;
