-- ============================================================
-- 最小権限化（migration_privacy.sql の後に実行）
-- 総点検（supabase/tests/security_audit.sql）で見つかった問題への対応：
--   ・ログインしていない人（anon）に、ほぼ全テーブルの権限が残っていた（RLS だけが頼りの状態）
--   ・多くのポリシーが「全員（public）」向けになっていた
-- 方針：アプリはブラウザからも必ずログイン済み（authenticated）として DB に接続する。
--       anon には何も許可しない。authenticated にも RLS を回避できる操作（TRUNCATE 等）は渡さない。
-- ============================================================

-- 1. anon からすべての権限を外す（テーブル・ビュー・シーケンス・関数）
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
-- これから作るテーブル・関数にも自動で付かないようにする
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- 2. ログイン済みユーザーにも、RLS を素通りする操作は渡さない
revoke truncate, references, trigger on all tables in schema public from authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;

-- 3. サーバー専用のテーブルは、ログイン済みユーザーからも一切触れない
revoke all on public.banned_providers from authenticated;
revoke all on public.safety_settings  from authenticated;
revoke insert, update, delete on public.room_access from authenticated;

-- 4. すべてのポリシーを「ログイン済みユーザー向け」に限定する
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies
           where schemaname = 'public' and roles = '{public}' loop
    execute format('alter policy %I on %I.%I to authenticated', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- 5. 自分の行だけを扱うポリシーに、書き込み時の条件も明示する
drop policy if exists "Users can manage own blocks" on public.blocks;
create policy "Users can manage own blocks" on public.blocks for all to authenticated
  using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id and blocked_id <> blocker_id);
drop policy if exists "Users can manage own tasks" on public.tasks;
create policy "Users can manage own tasks" on public.tasks for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 6. トリガー専用の関数は、誰からも直接呼べないようにする
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prorettype = 'trigger'::regtype loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;
