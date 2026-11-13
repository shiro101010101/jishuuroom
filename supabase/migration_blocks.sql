-- ============================================================
-- ブロックを確実に効かせる（migration_friendship_guard.sql の後に実行）
-- 以前のメッセージ送信ポリシーは blocks 表の RLS（ブロックした本人しか見えない）に阻まれて
-- 「相手にブロックされているか」を判定できず、ブロックが効いていなかった。
-- 判定専用の関数を用意し、メッセージ・カメラ通信・フレンド申請のすべてで使う。
-- ============================================================

-- 自分と相手のどちらかがブロックしていれば true（自分が関わる組み合わせしか調べられない）
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() in (a, b) and exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  )
$$;
revoke execute on function public.is_blocked_between(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

-- メッセージ：どちらかがブロックしていれば送れない
drop policy if exists "Users can send messages" on public.messages;
create policy "Users can send messages" on public.messages for insert with check (
  auth.uid() = sender_id and not public.is_blocked_between(sender_id, receiver_id)
);

-- カメラ通信（WebRTC のシグナル）：どちらかがブロックしていれば接続できない
drop policy if exists "Users can send signals" on public.webrtc_signals;
create policy "Users can send signals" on public.webrtc_signals for insert with check (
  auth.uid() = from_user and not public.is_blocked_between(from_user, to_user)
);

-- フレンド申請・承認：どちらかがブロックしていればできない
create or replace function public.guard_friendship_accept()
returns trigger as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  if new.status in ('pending', 'accepted') and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and public.is_blocked_between(new.requester_id, new.addressee_id) then
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

-- 一緒に勉強（ペア）申請：ブロック関係なら不可（フレンド確認は既存の関数内で実施）
create or replace function public.request_study_pair(partner_id uuid)
returns void as $$
declare
  a uuid := least(auth.uid(), partner_id);
  b uuid := greatest(auth.uid(), partner_id);
begin
  if auth.uid() is null or partner_id = auth.uid() then raise exception 'invalid'; end if;
  if public.is_blocked_between(auth.uid(), partner_id) then raise exception 'blocked'; end if;
  if not exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = auth.uid() and addressee_id = partner_id) or (requester_id = partner_id and addressee_id = auth.uid()))
  ) then
    raise exception 'フレンドのみにペアリクエストを送れます';
  end if;
  insert into public.study_pairs (user_a, user_b, requested_by, status)
  values (a, b, auth.uid(), 'pending')
  on conflict (user_a, user_b) do update set requested_by = excluded.requested_by, status = 'pending', activated_at = null
    where public.study_pairs.status = 'ended';
end;
$$ language plpgsql security definer set search_path = public;
revoke execute on function public.request_study_pair(uuid) from public, anon;

-- ペアの書き込みは関数（request/accept/end_study_pair）経由だけにする
-- （直接 UPDATE できると、申請した側が自分で「承認済み」にできてしまう）
drop policy if exists "Users can manage their own pairs" on public.study_pairs;
