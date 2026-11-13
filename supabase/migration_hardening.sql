-- ============================================================
-- 本番前のセキュリティ強化（migration_friend_rooms.sql の後に実行）
-- Supabase のセキュリティ警告（Security Advisor）への対応
-- ============================================================

-- 共有タスクのビューは「見る人の権限」で動かす（作成者権限で RLS をすり抜けない）
alter view public.shared_tasks_view set (security_invoker = true);

-- 関数の search_path を固定（なりすましテーブルによる乗っ取りを防ぐ）
alter function public.get_weekly_stats(uuid)                   set search_path = public;
alter function public.handle_new_user()                        set search_path = public;
alter function public.update_last_seen()                       set search_path = public;
alter function public.ban_user(uuid, text)                     set search_path = public;
alter function public.request_study_pair(uuid)                 set search_path = public;
alter function public.accept_study_pair(uuid)                  set search_path = public;
alter function public.end_study_pair(uuid)                     set search_path = public;
alter function public.get_leaderboard(timestamptz, uuid[], int) set search_path = public;
alter function public.get_my_rank(uuid, timestamptz, uuid[])   set search_path = public;
alter function public.protect_profile_columns()                set search_path = public;
alter function public.protect_message_columns()                set search_path = public;

-- ログインしていない人（anon）からは一切呼べないようにする
revoke execute on function public.accept_study_pair(uuid)                    from public, anon;
revoke execute on function public.request_study_pair(uuid)                   from public, anon;
revoke execute on function public.end_study_pair(uuid)                       from public, anon;
revoke execute on function public.send_reaction(uuid, uuid, text)            from public, anon;
revoke execute on function public.toggle_pin(uuid)                           from public, anon;
revoke execute on function public.update_last_seen()                         from public, anon;
revoke execute on function public.update_subject(text)                       from public, anon;

-- アプリから使っていない／サーバー専用の関数は、ブラウザから呼べないようにする
-- （BAN は /api/admin/ban が service_role で行う。handle_new_user はトリガー専用）
revoke execute on function public.ban_user(uuid, text)       from public, anon, authenticated;
revoke execute on function public.get_weekly_stats(uuid)     from public, anon, authenticated;
revoke execute on function public.handle_new_user()          from public, anon, authenticated;
