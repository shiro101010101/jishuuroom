-- ============================================================
-- 部屋の整理（Room 1〜3）・定員なし・ピン（理由／ひみつ）とマッチ・プロフィール（性別／Instagram）
-- migration_study_groups.sql の後に実行。何度実行しても大丈夫
-- 実行後は supabase/tests/security_audit.sql を流して「✅ 問題なし」を確認すること
-- ============================================================

-- ── 1. 公開ルームは Room 1〜3 だけ。残りはしまう（勉強記録は消えない） ──
alter table public.rooms add column if not exists is_archived boolean not null default false;

update public.rooms set name = 'Room 1', emoji = '📗', category = 'general', is_archived = false,
  description = 'みんなの自習室 · 何を勉強してもOK'
  where id = '00000000-0000-0000-0000-000000000001';
update public.rooms set name = 'Room 2', emoji = '📘', category = 'general', is_archived = false,
  description = 'みんなの自習室 · 何を勉強してもOK'
  where id = '00000000-0000-0000-0000-000000000002';
update public.rooms set name = 'Room 3', emoji = '📙', category = 'general', is_archived = false,
  description = 'みんなの自習室 · 何を勉強してもOK'
  where id = '00000000-0000-0000-0000-000000000003';
-- Room 1〜3 が無い環境（新しく作った DB など）のために作っておく
insert into public.rooms (id, name, description, emoji, category, is_private)
values
  ('00000000-0000-0000-0000-000000000001', 'Room 1', 'みんなの自習室 · 何を勉強してもOK', '📗', 'general', false),
  ('00000000-0000-0000-0000-000000000002', 'Room 2', 'みんなの自習室 · 何を勉強してもOK', '📘', 'general', false),
  ('00000000-0000-0000-0000-000000000003', 'Room 3', 'みんなの自習室 · 何を勉強してもOK', '📙', 'general', false)
on conflict (id) do nothing;

-- それ以外の公開ルームはしまう。予約されていた勉強会は Room 1 へ移す
update public.scheduled_sessions set room_id = '00000000-0000-0000-0000-000000000001'
  where room_id in (select id from public.rooms where not is_private
    and id not in ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003'));
update public.rooms set is_archived = true
  where not is_private
    and id not in ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003');
delete from public.room_members where room_id in (select id from public.rooms where is_archived);

-- ── 2. 定員なし（満員で入れない、をなくす）。しまった部屋には入れない ──
drop policy if exists "room_members insert" on public.room_members;
create policy "room_members insert" on public.room_members for insert to authenticated
  with check (
    auth.uid() = user_id and public.can_access_room(room_id) and not public.is_me_banned()
    and not exists (select 1 from public.rooms r where r.id = room_id and r.is_archived)
  );

-- ── 3. ピン：理由（任意・50文字まで）と「ひみつのピン」 ──
alter table public.pins add column if not exists reason text;
alter table public.pins add column if not exists is_secret boolean not null default false;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pins_reason_len') then
    alter table public.pins add constraint pins_reason_len check (reason is null or char_length(reason) <= 50);
  end if;
end $$;
create index if not exists pins_pinned_idx on public.pins (pinned_id);

-- 自分が相手をピンしているか（自分のピンについてしか答えない。他人どうしのひみつは調べられない）
create or replace function public.i_pinned(p_target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pins where pinner_id = auth.uid() and pinned_id = p_target)
$$;
revoke execute on function public.i_pinned(uuid) from public, anon;
grant execute on function public.i_pinned(uuid) to authenticated;

-- 見える範囲：自分のピン／自分へのピン（ひみつのピンは、お互いにピンしたときだけ）
drop policy if exists "pins visible to both" on public.pins;
drop policy if exists "pins read" on public.pins;
create policy "pins read" on public.pins for select to authenticated using (
  auth.uid() = pinner_id
  or (auth.uid() = pinned_id and (not is_secret or public.i_pinned(pinner_id)))
);

-- マッチ（お互いにピン）の記録と、ピン通知の送信記録。どちらもサーバー専用
create table if not exists public.pin_matches (
  user_a     uuid not null references public.profiles(id) on delete cascade,
  user_b     uuid not null references public.profiles(id) on delete cascade,
  matched_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create table if not exists public.pin_notices (
  pinner_id   uuid not null references public.profiles(id) on delete cascade,
  pinned_id   uuid not null references public.profiles(id) on delete cascade,
  notified_at timestamptz not null default now(),
  primary key (pinner_id, pinned_id)
);
alter table public.pin_matches enable row level security;
alter table public.pin_notices enable row level security;
revoke all on public.pin_matches from anon, authenticated;
revoke all on public.pin_notices from anon, authenticated;
grant select, insert, update, delete on public.pin_matches to service_role;
grant select, insert, update, delete on public.pin_notices to service_role;

-- ── 4. プロフィール：性別（任意）と Instagram（フレンド・マッチした相手にだけ見せる） ──
-- どちらも列の SELECT 権限は付けない。表示はサーバー（/api/profile/view）が関係を確かめてから返す
alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists instagram text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_gender_check') then
    alter table public.profiles add constraint profiles_gender_check check (gender is null or gender in ('female', 'male', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_instagram_format') then
    alter table public.profiles add constraint profiles_instagram_format check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$');
  end if;
end $$;
revoke select (gender, instagram), insert (gender, instagram), update (gender, instagram) on public.profiles from authenticated;

-- ── 5. ブロックしたら関係を全部切る（ピン・マッチ・ピン通知の記録・勉強会の招待） ──
create or replace function public.sever_on_block()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.pins
    where (pinner_id = new.blocker_id and pinned_id = new.blocked_id)
       or (pinner_id = new.blocked_id and pinned_id = new.blocker_id);
  delete from public.pin_matches
    where user_a = least(new.blocker_id, new.blocked_id) and user_b = greatest(new.blocker_id, new.blocked_id);
  delete from public.pin_notices
    where (pinner_id = new.blocker_id and pinned_id = new.blocked_id)
       or (pinner_id = new.blocked_id and pinned_id = new.blocker_id);
  delete from public.session_invites i
    using public.scheduled_sessions s
    where i.session_id = s.id
      and ((s.host_id = new.blocker_id and i.user_id = new.blocked_id) or (s.host_id = new.blocked_id and i.user_id = new.blocker_id));
  return new;
end $$;
revoke execute on function public.sever_on_block() from public, anon, authenticated;
drop trigger if exists sever_on_block on public.blocks;
create trigger sever_on_block after insert on public.blocks
  for each row execute procedure public.sever_on_block();
