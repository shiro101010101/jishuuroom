-- ============================================================
-- 自習室 JP — Supabase Schema
-- ============================================================

-- Enable extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
create table public.profiles (
  id           uuid references auth.users(id) on delete cascade primary key,
  username     text unique not null,
  display_name text not null,
  avatar_url   text,
  provider     text,                        -- 'google' | 'line'
  provider_id  text unique,                 -- OAuth provider user ID (ban-bypass prevention)
  is_banned    boolean default false,
  ban_reason   text,
  banned_at    timestamptz,
  banned_by    uuid references public.profiles(id),
  role         text default 'user',         -- 'user' | 'admin'
  created_at   timestamptz default now(),
  last_seen    timestamptz default now(),
  study_streak int default 0,
  total_study_seconds bigint default 0
);

-- RLS
alter table public.profiles enable row level security;
create policy "Profiles are viewable by everyone" on public.profiles
  for select using (true);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- ============================================================
-- BANNED PROVIDERS (prevent re-registration with same OAuth account)
-- ============================================================
create table public.banned_providers (
  id          uuid default uuid_generate_v4() primary key,
  provider    text not null,
  provider_id text not null,
  banned_at   timestamptz default now(),
  banned_by   uuid references public.profiles(id),
  reason      text,
  unique(provider, provider_id)
);

alter table public.banned_providers enable row level security;
create policy "Only admins can view banned providers" on public.banned_providers
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ============================================================
-- ROOMS
-- ============================================================
create table public.rooms (
  id          uuid default uuid_generate_v4() primary key,
  name        text not null,
  description text,
  emoji       text default '📚',
  category    text default 'general',       -- 'exam' | 'work' | 'programming' | 'language' | 'general'
  is_private  boolean default false,
  invite_code text unique,                  -- for private rooms
  max_members int default 20,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz default now()
);

alter table public.rooms enable row level security;
create policy "Public rooms visible to all" on public.rooms
  for select using (not is_private or created_by = auth.uid());
create policy "Authenticated users can create rooms" on public.rooms
  for insert with check (auth.uid() is not null);

-- Insert default rooms
insert into public.rooms (id, name, description, emoji, category) values
  ('00000000-0000-0000-0000-000000000001', '深夜の受験勉強', '静かに集中できる空間', '🧠', 'exam'),
  ('00000000-0000-0000-0000-000000000002', '社会人の資格勉強', '仕事帰りに一緒に', '💼', 'work'),
  ('00000000-0000-0000-0000-000000000003', '大学生の試験対策', 'テスト期間を乗り越える', '🌸', 'exam'),
  ('00000000-0000-0000-0000-000000000004', 'プログラミング学習', 'エンジニアを目指す仲間と', '💻', 'programming'),
  ('00000000-0000-0000-0000-000000000005', '語学学習', '英語・中国語・韓国語など', '📖', 'language'),
  ('00000000-0000-0000-0000-000000000006', '自由学習', '何でもOK！マイペースに', '🎯', 'general');

-- ============================================================
-- ROOM MEMBERS (realtime presence)
-- ============================================================
create table public.room_members (
  id           uuid default uuid_generate_v4() primary key,
  room_id      uuid references public.rooms(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete cascade,
  joined_at    timestamptz default now(),
  camera_on    boolean default false,
  status       text default 'studying',     -- 'studying' | 'break' | 'away'
  current_task text,
  study_seconds int default 0,
  unique(room_id, user_id)
);

alter table public.room_members enable row level security;
create policy "Room members visible to room participants" on public.room_members
  for select using (true);
create policy "Users can manage own membership" on public.room_members
  for all using (auth.uid() = user_id);

-- Enable realtime for room_members
alter publication supabase_realtime add table public.room_members;

-- ============================================================
-- FRIENDS
-- ============================================================
create table public.friendships (
  id          uuid default uuid_generate_v4() primary key,
  requester_id uuid references public.profiles(id) on delete cascade,
  addressee_id uuid references public.profiles(id) on delete cascade,
  status      text default 'pending',       -- 'pending' | 'accepted' | 'blocked'
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(requester_id, addressee_id),
  check(requester_id != addressee_id)
);

alter table public.friendships enable row level security;
create policy "Users can view their own friendships" on public.friendships
  for select using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "Users can manage their own friendships" on public.friendships
  for all using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- ============================================================
-- MESSAGES (friend direct messages)
-- ============================================================
create table public.messages (
  id          uuid default uuid_generate_v4() primary key,
  sender_id   uuid references public.profiles(id) on delete cascade,
  receiver_id uuid references public.profiles(id) on delete cascade,
  content     text not null check(length(content) <= 500),
  is_read     boolean default false,
  created_at  timestamptz default now()
);

alter table public.messages enable row level security;
create policy "Users can view their own messages" on public.messages
  for select using (auth.uid() = sender_id or auth.uid() = receiver_id);
create policy "Users can send messages" on public.messages
  for insert with check (auth.uid() = sender_id);
create policy "Receivers can mark as read" on public.messages
  for update using (auth.uid() = receiver_id);

-- Enable realtime for messages
alter publication supabase_realtime add table public.messages;

-- ============================================================
-- STUDY SESSIONS (stats)
-- ============================================================
create table public.study_sessions (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references public.profiles(id) on delete cascade,
  room_id     uuid references public.rooms(id),
  started_at  timestamptz default now(),
  ended_at    timestamptz,
  duration_seconds int,
  pomodoros_completed int default 0,
  tasks_completed int default 0
);

alter table public.study_sessions enable row level security;
create policy "Users can view own sessions" on public.study_sessions
  for select using (auth.uid() = user_id);
create policy "Users can manage own sessions" on public.study_sessions
  for all using (auth.uid() = user_id);

-- ============================================================
-- TASKS
-- ============================================================
create table public.tasks (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references public.profiles(id) on delete cascade,
  title       text not null,
  completed   boolean default false,
  created_at  timestamptz default now(),
  completed_at timestamptz,
  session_id  uuid references public.study_sessions(id)
);

alter table public.tasks enable row level security;
create policy "Users can manage own tasks" on public.tasks
  for all using (auth.uid() = user_id);

-- ============================================================
-- BLOCKS (user blocks - separate from friendships)
-- ============================================================
create table public.blocks (
  id          uuid default uuid_generate_v4() primary key,
  blocker_id  uuid references public.profiles(id) on delete cascade,
  blocked_id  uuid references public.profiles(id) on delete cascade,
  created_at  timestamptz default now(),
  unique(blocker_id, blocked_id)
);

alter table public.blocks enable row level security;
create policy "Users can manage own blocks" on public.blocks
  for all using (auth.uid() = blocker_id);

-- ============================================================
-- WEBRTC SIGNALING (for camera sharing)
-- ============================================================
create table public.webrtc_signals (
  id          uuid default uuid_generate_v4() primary key,
  room_id     uuid references public.rooms(id) on delete cascade,
  from_user   uuid references public.profiles(id) on delete cascade,
  to_user     uuid references public.profiles(id) on delete cascade,
  type        text not null,                -- 'offer' | 'answer' | 'ice-candidate'
  payload     jsonb not null,
  created_at  timestamptz default now()
);

alter table public.webrtc_signals enable row level security;
create policy "Users can view signals addressed to them" on public.webrtc_signals
  for select using (auth.uid() = to_user or auth.uid() = from_user);
create policy "Users can send signals" on public.webrtc_signals
  for insert with check (auth.uid() = from_user);
create policy "Users can delete own signals" on public.webrtc_signals
  for delete using (auth.uid() = from_user or auth.uid() = to_user);

-- Enable realtime
alter publication supabase_realtime add table public.webrtc_signals;

-- ============================================================
-- ADMIN REPORTS
-- ============================================================
create table public.reports (
  id           uuid default uuid_generate_v4() primary key,
  reporter_id  uuid references public.profiles(id),
  reported_id  uuid references public.profiles(id),
  reason       text not null,
  details      text,
  status       text default 'pending',      -- 'pending' | 'reviewed' | 'actioned'
  created_at   timestamptz default now(),
  reviewed_by  uuid references public.profiles(id),
  reviewed_at  timestamptz
);

alter table public.reports enable row level security;
create policy "Users can file reports" on public.reports
  for insert with check (auth.uid() = reporter_id);
create policy "Admins can view all reports" on public.reports
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
declare
  provider_uid text;
  is_banned_provider boolean;
begin
  -- Extract provider_id from raw_user_meta_data
  provider_uid := new.raw_user_meta_data->>'provider_id';
  if provider_uid is null then
    provider_uid := new.raw_user_meta_data->>'sub';
  end if;

  -- Check if this OAuth account is banned
  select exists(
    select 1 from public.banned_providers
    where provider = new.raw_app_meta_data->>'provider'
    and provider_id = provider_uid
  ) into is_banned_provider;

  if is_banned_provider then
    -- Mark as banned immediately
    insert into public.profiles (id, username, display_name, avatar_url, provider, provider_id, is_banned, ban_reason)
    values (
      new.id,
      'banned_' || substr(new.id::text, 1, 8),
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Banned User'),
      new.raw_user_meta_data->>'avatar_url',
      new.raw_app_meta_data->>'provider',
      provider_uid,
      true,
      'このアカウントはBANされています'
    );
  else
    insert into public.profiles (id, username, display_name, avatar_url, provider, provider_id)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'preferred_username',
               lower(regexp_replace(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'user'), '[^a-zA-Z0-9]', '', 'g')) || '_' || substr(new.id::text, 1, 6),
               'user_' || substr(new.id::text, 1, 8)),
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'ユーザー'),
      new.raw_user_meta_data->>'avatar_url',
      new.raw_app_meta_data->>'provider',
      provider_uid
    );
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Update last_seen
create or replace function public.update_last_seen()
returns void as $$
begin
  update public.profiles set last_seen = now() where id = auth.uid();
end;
$$ language plpgsql security definer;

-- Ban user + ban their OAuth provider account
create or replace function public.ban_user(target_user_id uuid, reason text)
returns void as $$
declare
  target_profile public.profiles%rowtype;
begin
  -- Check caller is admin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Not authorized';
  end if;

  select * into target_profile from public.profiles where id = target_user_id;

  -- Ban the profile
  update public.profiles set
    is_banned = true,
    ban_reason = reason,
    banned_at = now(),
    banned_by = auth.uid()
  where id = target_user_id;

  -- Ban the OAuth provider account to prevent re-registration
  if target_profile.provider is not null and target_profile.provider_id is not null then
    insert into public.banned_providers (provider, provider_id, banned_by, reason)
    values (target_profile.provider, target_profile.provider_id, auth.uid(), reason)
    on conflict (provider, provider_id) do nothing;
  end if;

  -- Remove from all rooms
  delete from public.room_members where user_id = target_user_id;

  -- Revoke auth session (optional: handled by admin via Supabase dashboard)
end;
$$ language plpgsql security definer;

-- Get weekly study stats
create or replace function public.get_weekly_stats(target_user_id uuid)
returns table(day_of_week int, total_seconds bigint) as $$
begin
  return query
    select
      extract(dow from started_at)::int as day_of_week,
      coalesce(sum(duration_seconds), 0) as total_seconds
    from public.study_sessions
    where user_id = target_user_id
      and started_at >= now() - interval '7 days'
    group by extract(dow from started_at)
    order by day_of_week;
end;
$$ language plpgsql security definer;
