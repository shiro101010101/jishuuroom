-- ============================================================
-- セキュリティ修正（migration_ranking.sql の後に実行）
-- 前提: Vercel に SUPABASE_JWT_SECRET を設定し、ブラウザの Supabase 接続が
--       本人として認証されていること（/api/supabase-token）
-- ============================================================

-- ── 全テーブルで RLS を有効化（無効化されていた場合に備えて） ──
do $$
declare t text;
begin
  foreach t in array array['profiles','banned_providers','rooms','room_members','friendships','messages',
    'study_sessions','tasks','blocks','webrtc_signals','reports','study_pairs','daily_messages','reactions',
    'pins','scheduled_sessions','session_participants'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ── プロフィール：ユーザーが自分で変えてはいけない列を保護 ──
-- （role を admin にする・BAN を解除する・勉強時間を書き換える、を防ぐ）
create or replace function public.protect_profile_columns()
returns trigger as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    new.id                  := old.id;
    new.role                := old.role;
    new.is_banned           := old.is_banned;
    new.ban_reason          := old.ban_reason;
    new.banned_at           := old.banned_at;
    new.banned_by           := old.banned_by;
    new.provider            := old.provider;
    new.provider_id         := old.provider_id;
    new.study_streak        := old.study_streak;
    new.total_study_seconds := old.total_study_seconds;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists protect_profile_columns on public.profiles;
create trigger protect_profile_columns before update on public.profiles
  for each row execute procedure public.protect_profile_columns();

-- ── 保護者設定は profiles（誰でも読める）から本人しか読めない表へ移す ──
create table if not exists public.safety_settings (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  parent_email  text,
  notify_method text default 'none',
  parent_pin    text,
  updated_at    timestamptz default now()
);
alter table public.safety_settings enable row level security;
drop policy if exists "safety own" on public.safety_settings;
create policy "safety own" on public.safety_settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into public.safety_settings (user_id, parent_email, notify_method, parent_pin)
  select id, parent_email, coalesce(notify_method, 'none'), parent_pin from public.profiles
  where parent_email is not null or parent_pin is not null
  on conflict (user_id) do nothing;
update public.profiles set parent_email = null, parent_pin = null
  where parent_email is not null or parent_pin is not null;

-- ── 勉強記録はサーバー（/api/study/heartbeat）だけが書き込む ──
drop policy if exists "Users can manage own sessions" on public.study_sessions;

-- ── 共有タスクは他の人も読める ──
drop policy if exists "Shared tasks are readable" on public.tasks;
create policy "Shared tasks are readable" on public.tasks for select using (is_shared = true);

-- ── ルーム作成者は自分として作る ──
drop policy if exists "Authenticated users can create rooms" on public.rooms;
create policy "Authenticated users can create rooms" on public.rooms
  for insert with check (auth.uid() is not null and created_by = auth.uid());

-- ── フレンド申請は「自分が申請者・保留中」でしか作れない ──
-- （承認時の逆向きの行は、相手からの申請がある場合だけ作れる）
drop policy if exists "Users can manage their own friendships" on public.friendships;
drop policy if exists "friendships insert" on public.friendships;
drop policy if exists "friendships update" on public.friendships;
drop policy if exists "friendships delete" on public.friendships;
create policy "friendships insert" on public.friendships for insert with check (
  auth.uid() = requester_id and (
    status = 'pending'
    or exists (select 1 from public.friendships f
               where f.requester_id = friendships.addressee_id and f.addressee_id = auth.uid()
                 and f.status in ('pending', 'accepted'))
  )
);
create policy "friendships update" on public.friendships for update
  using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "friendships delete" on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- ── メッセージ：受信者は既読フラグ以外を書き換えられない ──
create or replace function public.protect_message_columns()
returns trigger as $$
begin
  if current_user not in ('postgres', 'supabase_admin', 'service_role') then
    new.sender_id   := old.sender_id;
    new.receiver_id := old.receiver_id;
    new.content     := old.content;
    new.created_at  := old.created_at;
  end if;
  return new;
end;
$$ language plpgsql;
drop trigger if exists protect_message_columns on public.messages;
create trigger protect_message_columns before update on public.messages
  for each row execute procedure public.protect_message_columns();

-- ── ブロックした相手からのメッセージは送れない ──
drop policy if exists "Users can send messages" on public.messages;
create policy "Users can send messages" on public.messages for insert with check (
  auth.uid() = sender_id
  and not exists (select 1 from public.blocks b where b.blocker_id = receiver_id and b.blocked_id = auth.uid())
);
