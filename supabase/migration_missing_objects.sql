-- ============================================================
-- コードが使っているのに schema.sql に無かったテーブル・関数
-- （本番DBには手作業で作られていたもの。何度実行しても安全）
-- 実行順: schema.sql → migration_task_sharing.sql → このファイル
--        → migration_ranking.sql → migration_security.sql
-- ============================================================

-- NextAuth のユーザーIDは auth.users に存在しないため、外部キーを外す
alter table public.profiles drop constraint if exists profiles_id_fkey;

alter table public.profiles
  add column if not exists subject       text,
  add column if not exists parent_email  text,
  add column if not exists notify_method text default 'none',
  add column if not exists parent_pin    text;

-- ── 今日の一言 ──────────────────────────────────────────────
create table if not exists public.daily_messages (
  id         uuid default uuid_generate_v4() primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  room_id    uuid not null references public.rooms(id) on delete cascade,
  content    text not null check (length(content) between 1 and 100),
  date       date not null default current_date,
  created_at timestamptz default now(),
  unique (user_id, room_id, date)
);
alter table public.daily_messages enable row level security;
drop policy if exists "daily_messages readable" on public.daily_messages;
create policy "daily_messages readable" on public.daily_messages for select using (true);
drop policy if exists "daily_messages own" on public.daily_messages;
create policy "daily_messages own" on public.daily_messages for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── リアクション（送信は send_reaction 経由のみ） ───────────────
create table if not exists public.reactions (
  id          uuid default uuid_generate_v4() primary key,
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  room_id     uuid references public.rooms(id) on delete cascade,
  emoji       text not null,
  created_at  timestamptz default now()
);
create index if not exists reactions_room_idx on public.reactions (room_id, created_at);
alter table public.reactions enable row level security;
drop policy if exists "reactions readable" on public.reactions;
create policy "reactions readable" on public.reactions for select using (true);

create or replace function public.send_reaction(p_receiver_id uuid, p_room_id uuid, p_emoji text)
returns jsonb as $$
declare
  last_sent timestamptz;
begin
  if auth.uid() is null then return jsonb_build_object('success', false, 'error', 'ログインが必要です'); end if;
  if p_receiver_id = auth.uid() then return jsonb_build_object('success', false, 'error', '自分には送れません'); end if;
  if p_emoji not in ('👍','🔥','💪','✨','❤️','🎉','😊','🫡') then
    return jsonb_build_object('success', false, 'error', 'このリアクションは使えません');
  end if;
  if exists (select 1 from public.blocks where blocker_id = p_receiver_id and blocked_id = auth.uid()) then
    return jsonb_build_object('success', false, 'error', '送信できません');
  end if;
  -- 同じ相手には1時間に1回まで
  select max(created_at) into last_sent from public.reactions
    where sender_id = auth.uid() and receiver_id = p_receiver_id;
  if last_sent is not null and last_sent > now() - interval '1 hour' then
    return jsonb_build_object('success', false, 'error', 'あと' || ceil(extract(epoch from (last_sent + interval '1 hour' - now())) / 60) || '分後に送れます',
                              'next_available', last_sent + interval '1 hour');
  end if;
  insert into public.reactions (sender_id, receiver_id, room_id, emoji) values (auth.uid(), p_receiver_id, p_room_id, p_emoji);
  return jsonb_build_object('success', true);
end;
$$ language plpgsql security definer set search_path = public;

-- ── ピン留め ────────────────────────────────────────────────
create table if not exists public.pins (
  id         uuid default uuid_generate_v4() primary key,
  pinner_id  uuid not null references public.profiles(id) on delete cascade,
  pinned_id  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (pinner_id, pinned_id),
  check (pinner_id <> pinned_id)
);
alter table public.pins enable row level security;
drop policy if exists "pins visible to both" on public.pins;
create policy "pins visible to both" on public.pins for select
  using (auth.uid() = pinner_id or auth.uid() = pinned_id);

create or replace function public.toggle_pin(p_target_id uuid)
returns jsonb as $$
declare
  removed int;
  is_mutual boolean;
begin
  if auth.uid() is null or p_target_id = auth.uid() then
    return jsonb_build_object('pinned', false, 'mutual', false);
  end if;
  delete from public.pins where pinner_id = auth.uid() and pinned_id = p_target_id;
  get diagnostics removed = row_count;
  if removed > 0 then return jsonb_build_object('pinned', false, 'mutual', false); end if;
  insert into public.pins (pinner_id, pinned_id) values (auth.uid(), p_target_id);
  select exists (select 1 from public.pins where pinner_id = p_target_id and pinned_id = auth.uid()) into is_mutual;
  return jsonb_build_object('pinned', true, 'mutual', is_mutual);
end;
$$ language plpgsql security definer set search_path = public;

-- ── 科目 ────────────────────────────────────────────────────
create or replace function public.update_subject(p_subject text)
returns void as $$
  update public.profiles set subject = left(p_subject, 30) where id = auth.uid();
$$ language sql security definer set search_path = public;

-- ── セッション予約 ──────────────────────────────────────────
create table if not exists public.scheduled_sessions (
  id            uuid default uuid_generate_v4() primary key,
  host_id       uuid not null references public.profiles(id) on delete cascade,
  room_id       uuid references public.rooms(id) on delete cascade,
  title         text not null check (length(title) <= 100),
  subject       text,
  scheduled_at  timestamptz not null,
  duration_mins int not null default 60 check (duration_mins between 5 and 600),
  created_at    timestamptz default now()
);
alter table public.scheduled_sessions enable row level security;
drop policy if exists "sessions readable" on public.scheduled_sessions;
create policy "sessions readable" on public.scheduled_sessions for select using (auth.uid() is not null);
drop policy if exists "sessions host manages" on public.scheduled_sessions;
create policy "sessions host manages" on public.scheduled_sessions for all
  using (auth.uid() = host_id) with check (auth.uid() = host_id);

create table if not exists public.session_participants (
  id         uuid default uuid_generate_v4() primary key,
  session_id uuid not null references public.scheduled_sessions(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (session_id, user_id)
);
alter table public.session_participants enable row level security;
drop policy if exists "participants readable" on public.session_participants;
create policy "participants readable" on public.session_participants for select using (auth.uid() is not null);
drop policy if exists "participants own" on public.session_participants;
create policy "participants own" on public.session_participants for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── リアルタイム配信 ────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['daily_messages','reactions','pins','friendships'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
