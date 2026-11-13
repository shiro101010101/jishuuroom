-- ============================================================
-- 部屋・カメラ通信・BAN の強化（migration_blocks.sql の後に実行）
-- セキュリティレビューの指摘（H1/H2/M1/M3/M4/L1/L2）への対応
-- ============================================================

-- その部屋に入れるか（公開ルーム・作成者・入室権あり）
create or replace function public.can_access_room(rid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.rooms r
    where r.id = rid and (
      not r.is_private
      or r.created_by = auth.uid()
      or exists (select 1 from public.room_access a where a.room_id = r.id and a.user_id = auth.uid())
    )
  )
$$;

-- 自分が BAN されているか
create or replace function public.is_me_banned()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_banned from public.profiles where id = auth.uid()), false)
$$;

revoke execute on function public.can_access_room(uuid) from public, anon;
revoke execute on function public.is_me_banned()        from public, anon;
grant execute on function public.can_access_room(uuid) to authenticated;
grant execute on function public.is_me_banned()        to authenticated;

-- 予約セッションへの参加登録は、その部屋に入れる人（招待リンクを開いた人など）だけ
-- （誰でも参加登録できると、それを足がかりにプライベートルームへ入れてしまう）
drop trigger if exists grant_session_room_access on public.session_participants;
drop function if exists public.grant_session_room_access();
drop policy if exists "participants own" on public.session_participants;
create policy "participants own" on public.session_participants for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and exists (
    select 1 from public.scheduled_sessions s
    where s.id = session_id and (s.room_id is null or public.can_access_room(s.room_id))
  ));

-- ── H2: 入室権のない部屋のメンバーには登録できない ──
drop policy if exists "Users can manage own membership" on public.room_members;
drop policy if exists "Room members visible to room participants" on public.room_members;
drop policy if exists "room_members select" on public.room_members;
drop policy if exists "room_members insert" on public.room_members;
drop policy if exists "room_members update" on public.room_members;
drop policy if exists "room_members delete" on public.room_members;
-- M3: 在室者が見えるのは、その部屋に入れる人だけ
create policy "room_members select" on public.room_members for select
  using (public.can_access_room(room_id));
create policy "room_members insert" on public.room_members for insert
  with check (auth.uid() = user_id and public.can_access_room(room_id) and not public.is_me_banned());
create policy "room_members update" on public.room_members for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.can_access_room(room_id) and not public.is_me_banned());
create policy "room_members delete" on public.room_members for delete
  using (auth.uid() = user_id);

-- ── H1: カメラ通信は「同じ部屋に入っている人どうし」だけ ──
drop policy if exists "Users can send signals" on public.webrtc_signals;
create policy "Users can send signals" on public.webrtc_signals for insert with check (
  auth.uid() = from_user
  and not public.is_me_banned()
  and not public.is_blocked_between(from_user, to_user)
  and public.can_access_room(room_id)
  and exists (select 1 from public.room_members m where m.room_id = webrtc_signals.room_id and m.user_id = from_user)
  and exists (select 1 from public.room_members m where m.room_id = webrtc_signals.room_id and m.user_id = to_user)
);

-- ── M1: 部屋はサーバー（/api/room/private）だけが作る ──
drop policy if exists "Authenticated users can create rooms" on public.rooms;

-- ── M4 / L1: メッセージはフレンドどうしだけ。BAN 中は送れない ──
drop policy if exists "Users can send messages" on public.messages;
create policy "Users can send messages" on public.messages for insert with check (
  auth.uid() = sender_id
  and not public.is_me_banned()
  and not public.is_blocked_between(sender_id, receiver_id)
  and exists (
    select 1 from public.friendships f
    where f.status = 'accepted' and f.requester_id = sender_id and f.addressee_id = receiver_id
  )
);

-- ── L2: 表示名・画像・自己紹介はサーバー（/api/profile）経由でしか変えられない ──
create or replace function public.protect_profile_columns()
returns trigger as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    new.id                  := old.id;
    new.username            := old.username;
    new.display_name        := old.display_name;
    new.avatar_url          := old.avatar_url;
    new.bio                 := old.bio;
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
$$ language plpgsql set search_path = public;

-- BAN 中はフレンド申請・承認もできない
create or replace function public.guard_friendship_accept()
returns trigger as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  if new.status in ('pending', 'accepted') and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and (public.is_me_banned() or public.is_blocked_between(new.requester_id, new.addressee_id)) then
    raise exception 'blocked';
  end if;
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    if auth.uid() is distinct from new.addressee_id and not exists (
      select 1 from public.friendships f
      where f.requester_id = new.addressee_id and f.addressee_id = new.requester_id
        and f.status in ('pending', 'accepted')
    ) then
      raise exception 'friend request must be accepted by the recipient';
    end if;
  end if;
  if tg_op = 'UPDATE' and (new.requester_id <> old.requester_id or new.addressee_id <> old.addressee_id) then
    raise exception 'cannot change friendship participants';
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

-- L7: 同じ provider の中で ID が一意になるように（Google と LINE の ID が偶然一致しても別人扱い）
alter table public.profiles drop constraint if exists profiles_provider_id_key;
create unique index if not exists profiles_provider_provider_id_key on public.profiles (provider, provider_id);
