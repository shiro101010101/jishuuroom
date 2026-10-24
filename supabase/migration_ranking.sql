-- ============================================================
-- 勉強時間ランキング（schema.sql の後に SQL Editor で実行）
-- 勉強時間はサーバー（/api/study/heartbeat）だけが記録する
-- ============================================================

-- 計測中セッションの最終ハートビート時刻（null = 終了済み）
alter table public.study_sessions
  add column if not exists last_heartbeat_at timestamptz;

create index if not exists study_sessions_started_at_idx
  on public.study_sessions (started_at);
create index if not exists study_sessions_user_started_idx
  on public.study_sessions (user_id, started_at);

-- ランキング集計（集計値のみ返す。service_role から呼ぶ）
create or replace function public.get_leaderboard(
  p_since    timestamptz,
  p_user_ids uuid[] default null,
  p_limit    int default 50
)
returns table(
  user_id       uuid,
  display_name  text,
  avatar_url    text,
  study_streak  int,
  total_seconds bigint,
  rank          bigint
) as $$
  select
    s.user_id,
    p.display_name,
    p.avatar_url,
    coalesce(p.study_streak, 0),
    sum(s.duration_seconds)::bigint as total_seconds,
    rank() over (order by sum(s.duration_seconds) desc) as rank
  from public.study_sessions s
  join public.profiles p on p.id = s.user_id
  where s.started_at >= p_since
    and coalesce(p.is_banned, false) = false
    and (p_user_ids is null or s.user_id = any(p_user_ids))
  group by s.user_id, p.display_name, p.avatar_url, p.study_streak
  having sum(s.duration_seconds) > 0
  order by total_seconds desc
  limit p_limit
$$ language sql stable security definer;

-- 自分の順位（上位 p_limit 外でも取得できるように）
create or replace function public.get_my_rank(
  p_user_id  uuid,
  p_since    timestamptz,
  p_user_ids uuid[] default null
)
returns table(total_seconds bigint, rank bigint, participants bigint) as $$
  with totals as (
    select s.user_id, sum(s.duration_seconds)::bigint as total
    from public.study_sessions s
    join public.profiles p on p.id = s.user_id
    where s.started_at >= p_since
      and coalesce(p.is_banned, false) = false
      and (p_user_ids is null or s.user_id = any(p_user_ids))
    group by s.user_id
    having sum(s.duration_seconds) > 0
  )
  select
    coalesce((select total from totals where user_id = p_user_id), 0),
    case when exists (select 1 from totals where user_id = p_user_id)
      then (select count(*) + 1 from totals where total > (select total from totals where user_id = p_user_id))
      else null end,
    (select count(*) from totals)
$$ language sql stable security definer;

-- クライアントから直接呼べないようにする
revoke execute on function public.get_leaderboard(timestamptz, uuid[], int) from public, anon, authenticated;
revoke execute on function public.get_my_rank(uuid, timestamptz, uuid[]) from public, anon, authenticated;
