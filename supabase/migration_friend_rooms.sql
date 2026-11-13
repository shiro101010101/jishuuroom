-- ============================================================
-- 友達と勉強する部屋（migration_profile.sql の後に実行）
-- ・プライベートルームに「入れる人」の表 room_access を追加
-- ・招待リンクを開いた人／フレンドから招待された人もプライベートルームを見られるようにする
-- 書き込みはサーバー（/api/room/*）が service_role で行う
-- ============================================================

create table if not exists public.room_access (
  room_id    uuid not null references public.rooms(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  granted_at timestamptz default now(),
  primary key (room_id, user_id)
);
create index if not exists room_access_user_idx on public.room_access (user_id);

alter table public.room_access enable row level security;
drop policy if exists "room_access own" on public.room_access;
create policy "room_access own" on public.room_access
  for select using (auth.uid() = user_id);

-- 既存のプライベートルーム：作成者と予約セッションの参加者に入室権を付ける
insert into public.room_access (room_id, user_id)
  select id, created_by from public.rooms
  where is_private and created_by is not null
  on conflict do nothing;
insert into public.room_access (room_id, user_id)
  select s.room_id, p.user_id
  from public.scheduled_sessions s
  join public.session_participants p on p.session_id = s.id
  where s.room_id is not null
  on conflict do nothing;

-- ルームの閲覧：公開ルーム・自分が作った部屋・入室権がある部屋
drop policy if exists "Public rooms visible to all" on public.rooms;
drop policy if exists "Rooms visible to members" on public.rooms;
create policy "Rooms visible to members" on public.rooms for select using (
  not is_private
  or created_by = auth.uid()
  or exists (select 1 from public.room_access a where a.room_id = rooms.id and a.user_id = auth.uid())
);

-- 作成者は自分のプライベートルームを削除できる
drop policy if exists "Owners can delete private rooms" on public.rooms;
create policy "Owners can delete private rooms" on public.rooms
  for delete using (is_private and created_by = auth.uid());
