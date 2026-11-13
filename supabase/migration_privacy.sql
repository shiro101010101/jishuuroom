-- ============================================================
-- プライバシー強化（migration_room_security.sql の後に実行）
-- セキュリティ再レビューの指摘（高1・中2・中3・中4・中5・低1/2/5/6/7）への対応
-- ============================================================

-- ── 高1: プロフィールはログインした人だけ・公開してよい列だけ ──
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (true);
revoke all on public.profiles from anon;
revoke select, insert, update, delete on public.profiles from authenticated;
grant select (id, username, display_name, avatar_url, bio, subject, study_streak, total_study_seconds, created_at)
  on public.profiles to authenticated;
-- 自分のプロフィールを直接書き換える経路は使っていない（更新はサーバーと RPC だけ）
drop policy if exists "Users can update own profile" on public.profiles;

-- 使わなくなった保護者情報の列（safety_settings へ移行済み）を消す
alter table public.profiles drop column if exists parent_email;
alter table public.profiles drop column if exists parent_pin;
alter table public.profiles drop column if exists notify_method;

-- ── 中4: 保護者 PIN（平文）を本人が読み書きできないように。通知機能ができるまで使わない ──
revoke all on public.safety_settings from anon, authenticated;
drop policy if exists "safety own" on public.safety_settings;

-- ── 中2: 今日の一言は、その部屋に入れる人だけが読み書きできる ──
drop policy if exists "daily_messages readable" on public.daily_messages;
drop policy if exists "daily_messages own" on public.daily_messages;
drop policy if exists "dm read" on public.daily_messages;
drop policy if exists "dm write" on public.daily_messages;
create policy "dm read" on public.daily_messages for select to authenticated
  using (public.can_access_room(room_id) and not public.is_blocked_between(auth.uid(), user_id));
create policy "dm write" on public.daily_messages for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.can_access_room(room_id) and not public.is_me_banned());

-- リアクション：本人どうしか、その部屋に入れる人だけが見える
drop policy if exists "reactions readable" on public.reactions;
drop policy if exists "reactions read" on public.reactions;
create policy "reactions read" on public.reactions for select to authenticated
  using (auth.uid() in (sender_id, receiver_id) or (room_id is not null and public.can_access_room(room_id)));

-- リアクション送信：自分も相手も同じ部屋にいて、BAN・ブロックでないときだけ
create or replace function public.send_reaction(p_receiver_id uuid, p_room_id uuid, p_emoji text)
returns jsonb as $$
declare
  last_sent timestamptz;
begin
  if auth.uid() is null then return jsonb_build_object('success', false, 'error', 'ログインが必要です'); end if;
  if public.is_me_banned() then return jsonb_build_object('success', false, 'error', '送信できません'); end if;
  if p_receiver_id = auth.uid() then return jsonb_build_object('success', false, 'error', '自分には送れません'); end if;
  if p_emoji not in ('👍','🔥','💪','✨','❤️','🎉','😊','🫡') then
    return jsonb_build_object('success', false, 'error', 'このリアクションは使えません');
  end if;
  if public.is_blocked_between(auth.uid(), p_receiver_id) then
    return jsonb_build_object('success', false, 'error', '送信できません');
  end if;
  if p_room_id is null
     or not exists (select 1 from public.room_members where room_id = p_room_id and user_id = auth.uid())
     or not exists (select 1 from public.room_members where room_id = p_room_id and user_id = p_receiver_id) then
    return jsonb_build_object('success', false, 'error', '同じ部屋にいる人にだけ送れます');
  end if;
  select max(created_at) into last_sent from public.reactions
    where sender_id = auth.uid() and receiver_id = p_receiver_id;
  if last_sent is not null and last_sent > now() - interval '1 hour' then
    return jsonb_build_object('success', false, 'error', 'あと' || ceil(extract(epoch from (last_sent + interval '1 hour' - now())) / 60) || '分後に送れます',
                              'next_available', last_sent + interval '1 hour');
  end if;
  -- 全体でも 1 時間に 30 回まで（連打・荒らし防止）
  if (select count(*) from public.reactions where sender_id = auth.uid() and created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('success', false, 'error', 'しばらく時間をおいてください');
  end if;
  insert into public.reactions (sender_id, receiver_id, room_id, emoji) values (auth.uid(), p_receiver_id, p_room_id, p_emoji);
  return jsonb_build_object('success', true);
end;
$$ language plpgsql security definer set search_path = public;
revoke execute on function public.send_reaction(uuid, uuid, text) from public, anon;

-- ピン留め：ブロック・BAN 中は不可
create or replace function public.toggle_pin(p_target_id uuid)
returns jsonb as $$
declare
  removed int;
  is_mutual boolean;
begin
  if auth.uid() is null or p_target_id = auth.uid() or public.is_me_banned()
     or public.is_blocked_between(auth.uid(), p_target_id) then
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
revoke execute on function public.toggle_pin(uuid) from public, anon;

-- 共有タスク：「フレンドに公開」はフレンドだけ、「部屋に公開」は同じ部屋の人だけ
drop policy if exists "Shared tasks are readable" on public.tasks;
create policy "Shared tasks are readable" on public.tasks for select to authenticated using (
  is_shared and not public.is_blocked_between(auth.uid(), user_id) and (
    (share_scope = 'friends' and exists (
      select 1 from public.friendships f
      where f.status = 'accepted' and f.requester_id = auth.uid() and f.addressee_id = tasks.user_id))
    or (share_scope = 'room' and exists (
      select 1 from public.room_members me join public.room_members t on t.room_id = me.room_id
      where me.user_id = auth.uid() and t.user_id = tasks.user_id))
  )
);
alter table public.tasks drop constraint if exists tasks_title_len;
alter table public.tasks add constraint tasks_title_len check (char_length(title) <= 200) not valid;

-- ── 中3: 予約セッションは、その部屋に入れる人・主催者・参加者だけが見える ──
drop policy if exists "sessions readable" on public.scheduled_sessions;
create policy "sessions readable" on public.scheduled_sessions for select to authenticated using (
  host_id = auth.uid() or room_id is null or public.can_access_room(room_id)
);
drop policy if exists "sessions host manages" on public.scheduled_sessions;
create policy "sessions host manages" on public.scheduled_sessions for all to authenticated
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id and (room_id is null or public.can_access_room(room_id)) and not public.is_me_banned());
drop policy if exists "participants readable" on public.session_participants;
create policy "participants readable" on public.session_participants for select to authenticated using (
  user_id = auth.uid()
  or exists (select 1 from public.scheduled_sessions s where s.id = session_id and (s.host_id = auth.uid() or public.can_access_room(s.room_id)))
);

-- ── 低2: 通報は「保留中」でしか作れず、長さも制限。1 時間に 10 件まで ──
drop policy if exists "Users can file reports" on public.reports;
create policy "Users can file reports" on public.reports for insert to authenticated with check (
  auth.uid() = reporter_id and status = 'pending' and reviewed_by is null and reviewed_at is null
  and char_length(reason) <= 50 and char_length(coalesce(details, '')) <= 1000
);
create or replace function public.rl_reports() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.reports where reporter_id = new.reporter_id and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate limit';
  end if;
  return new;
end $$;
drop trigger if exists rl_reports on public.reports;
create trigger rl_reports before insert on public.reports for each row execute procedure public.rl_reports();

-- ── 中5: フレンド申請・メッセージの回数制限 ──
create or replace function public.rl_friend_requests() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then return new; end if;
  if new.status = 'pending' and (select count(*) from public.friendships
      where requester_id = new.requester_id and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'rate limit';
  end if;
  return new;
end $$;
drop trigger if exists rl_friend_requests on public.friendships;
create trigger rl_friend_requests before insert on public.friendships for each row execute procedure public.rl_friend_requests();

create or replace function public.rl_messages() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then return new; end if;
  if (select count(*) from public.messages where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'rate limit';
  end if;
  return new;
end $$;
drop trigger if exists rl_messages on public.messages;
create trigger rl_messages before insert on public.messages for each row execute procedure public.rl_messages();

-- ── カメラ通信：種類とサイズを制限し、古いシグナル（接続情報を含む）を自動で消す（低1） ──
drop policy if exists "Users can send signals" on public.webrtc_signals;
create policy "Users can send signals" on public.webrtc_signals for insert to authenticated with check (
  auth.uid() = from_user
  and type in ('description', 'offer', 'answer', 'ice-candidate', 'bye')
  and pg_column_size(payload) < 16384
  and not public.is_me_banned()
  and not public.is_blocked_between(from_user, to_user)
  and public.can_access_room(room_id)
  and exists (select 1 from public.room_members m where m.room_id = webrtc_signals.room_id and m.user_id = from_user)
  and exists (select 1 from public.room_members m where m.room_id = webrtc_signals.room_id and m.user_id = to_user)
);
create or replace function public.cleanup_old_signals() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.webrtc_signals where created_at < now() - interval '5 minutes';
  return null;
end $$;
drop trigger if exists cleanup_old_signals on public.webrtc_signals;
create trigger cleanup_old_signals after insert on public.webrtc_signals
  for each statement execute procedure public.cleanup_old_signals();

-- ── 低5: 部屋の定員を守る ──
create or replace function public.room_has_space(rid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (select count(*) from public.room_members where room_id = rid and user_id <> auth.uid())
       < coalesce((select max_members from public.rooms where id = rid), 20)
$$;
revoke execute on function public.room_has_space(uuid) from public, anon;
grant execute on function public.room_has_space(uuid) to authenticated;
drop policy if exists "room_members insert" on public.room_members;
create policy "room_members insert" on public.room_members for insert to authenticated
  with check (auth.uid() = user_id and public.can_access_room(room_id) and public.room_has_space(room_id) and not public.is_me_banned());

-- ── 高1: Presence（オンライン表示）はログインした人だけが参加できる非公開チャンネルで ──
drop policy if exists "presence read" on realtime.messages;
drop policy if exists "presence write" on realtime.messages;
create policy "presence read" on realtime.messages for select to authenticated
  using (realtime.topic() = 'presence:global' and not public.is_me_banned());
create policy "presence write" on realtime.messages for insert to authenticated
  with check (realtime.topic() = 'presence:global' and realtime.messages.extension = 'presence' and not public.is_me_banned());
