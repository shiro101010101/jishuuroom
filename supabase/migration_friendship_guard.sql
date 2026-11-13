-- ============================================================
-- フレンド承認の不正防止（migration_hardening.sql の後に実行）
-- 申請した側が自分の申請行を勝手に 'accepted' に書き換えて、
-- 相手の同意なしにフレンドになることを防ぐ
-- ============================================================

create or replace function public.guard_friendship_accept()
returns trigger as $$
begin
  -- サーバー（service_role）や管理操作は対象外
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    -- 承認できるのは「申請された側」か、相手からの申請がすでに承認済み／保留中のとき（承認時に作る逆向きの行）
    if auth.uid() is distinct from new.addressee_id and not exists (
      select 1 from public.friendships f
      where f.requester_id = new.addressee_id and f.addressee_id = new.requester_id
        and f.status in ('pending', 'accepted')
    ) then
      raise exception 'friend request must be accepted by the recipient';
    end if;
  end if;
  -- 申請者・相手の入れ替えは禁止
  if tg_op = 'UPDATE' and (new.requester_id <> old.requester_id or new.addressee_id <> old.addressee_id) then
    raise exception 'cannot change friendship participants';
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

drop trigger if exists guard_friendship_accept on public.friendships;
create trigger guard_friendship_accept before insert or update on public.friendships
  for each row execute procedure public.guard_friendship_accept();
