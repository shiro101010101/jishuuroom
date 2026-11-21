-- ============================================================
-- セキュリティ再点検（2026-11）への対応。migration_premium.sql の後に実行。何度実行しても大丈夫
--   高1: 古い toggle_pin RPC でひみつのピンを探れた → ブラウザから呼べなくする（ピンは /api/pins だけ）
--   中3: 勉強会の参加者をブラウザから直接追加できた → 書き込みはサーバー専用・読めるのは関係者だけ
--   中4: 勉強会をブラウザから直接書き換えられた（上限回避・通知スパム） → 書き込みはサーバー専用
--   中5: ブロックしても部屋の入室権・勉強会の参加が残った → ブロック時に削除
--   通知の連打防止の記録（notice_log）、Stripe のイベント重複防止（stripe_events）
--   申し込み時の同意の記録は、アカウントを消しても残す（争いになったときの証拠）
-- 実行後は supabase/tests/security_audit.sql を流して「✅ 問題なし」を確認すること
-- ============================================================

-- 高1：古いピンの RPC は消す（ピンは /api/pins だけ）
drop function if exists public.toggle_pin(uuid);

-- ピンを付けた記録（外しても消えない）。1 日の上限はこれで数える。サーバー専用
create table if not exists public.pin_events (
  id         bigint generated always as identity primary key,
  pinner_id  uuid not null references public.profiles(id) on delete cascade,
  pinned_id  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists pin_events_pinner_idx on public.pin_events (pinner_id, created_at);
alter table public.pin_events enable row level security;
revoke all on public.pin_events from anon, authenticated;
grant select, insert, delete on public.pin_events to service_role;

-- 中3・中4：関係者かどうか（主催者か参加者）。自分についてしか答えない
create or replace function public.is_session_member(p_session uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.scheduled_sessions s where s.id = p_session and s.host_id = auth.uid())
      or exists (select 1 from public.session_participants p where p.session_id = p_session and p.user_id = auth.uid())
$$;
revoke execute on function public.is_session_member(uuid) from public, anon;
grant execute on function public.is_session_member(uuid) to authenticated;

drop policy if exists "sessions readable" on public.scheduled_sessions;
drop policy if exists "sessions host manages" on public.scheduled_sessions;
create policy "sessions readable" on public.scheduled_sessions for select to authenticated using (
  host_id = auth.uid()
  or public.is_session_member(id)
  or (room_id is not null and exists (select 1 from public.rooms r where r.id = room_id and r.is_private) and public.can_access_room(room_id))
);
revoke insert, update, delete on public.scheduled_sessions from authenticated;

drop policy if exists "participants readable" on public.session_participants;
drop policy if exists "participants own" on public.session_participants;
create policy "participants readable" on public.session_participants for select to authenticated using (
  user_id = auth.uid() or public.is_session_member(session_id)
);
revoke insert, update, delete on public.session_participants from authenticated;

-- 中5：ブロックしたら関係を全部切る（部屋の入室権・在室・勉強会の参加も）
create or replace function public.sever_on_block()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- ブロックした人のピンは消す。ブロックされた人からのひみつのピンは残す（消すと件数が減り、送り主がばれるため。
  -- ブロック中はピンし返せないので、マッチすることはない）
  delete from public.pins
    where (pinner_id = new.blocker_id and pinned_id = new.blocked_id)
       or (pinner_id = new.blocked_id and pinned_id = new.blocker_id and not is_secret);
  delete from public.pin_matches
    where user_a = least(new.blocker_id, new.blocked_id) and user_b = greatest(new.blocker_id, new.blocked_id);
  delete from public.pin_notices
    where (pinner_id = new.blocker_id and pinned_id = new.blocked_id)
       or (pinner_id = new.blocked_id and pinned_id = new.blocker_id);
  delete from public.session_invites i using public.scheduled_sessions s
    where i.session_id = s.id
      and ((s.host_id = new.blocker_id and i.user_id = new.blocked_id) or (s.host_id = new.blocked_id and i.user_id = new.blocker_id));
  delete from public.session_participants p using public.scheduled_sessions s
    where p.session_id = s.id
      and ((s.host_id = new.blocker_id and p.user_id = new.blocked_id) or (s.host_id = new.blocked_id and p.user_id = new.blocker_id));
  delete from public.room_access a using public.rooms r
    where a.room_id = r.id and r.is_private
      and ((r.created_by = new.blocker_id and a.user_id = new.blocked_id) or (r.created_by = new.blocked_id and a.user_id = new.blocker_id));
  delete from public.room_members m using public.rooms r
    where m.room_id = r.id and r.is_private
      and ((r.created_by = new.blocker_id and m.user_id = new.blocked_id) or (r.created_by = new.blocked_id and m.user_id = new.blocker_id));
  return new;
end $$;
revoke execute on function public.sever_on_block() from public, anon, authenticated;

-- 通知の連打防止（キーごとに最後に送った時刻）。サーバー専用
create table if not exists public.notice_log (
  key     text primary key check (char_length(key) <= 200),
  sent_at timestamptz not null default now()
);
alter table public.notice_log enable row level security;
revoke all on public.notice_log from anon, authenticated;
grant select, insert, update, delete on public.notice_log to service_role;

-- Stripe のイベントを二重に処理しない。サーバー専用
create table if not exists public.stripe_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;
grant select, insert, update, delete on public.stripe_events to service_role;

-- 申し込み時の同意の記録はアカウント削除後も残す（user_id は空にする）
alter table public.billing_consents alter column user_id drop not null;
alter table public.billing_consents drop constraint if exists billing_consents_user_id_fkey;
alter table public.billing_consents add constraint billing_consents_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

-- 実際に契約した申し込みの同意に印を付ける（生年月日の固定は、この印のある同意だけを基準にする）
alter table public.billing_consents add column if not exists confirmed boolean not null default false;
