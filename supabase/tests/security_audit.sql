-- ============================================================
-- DB セキュリティ総点検（読み取りのみ・何度でも実行可）
-- 「思いついた攻撃を試す」のではなく、全テーブル・全ポリシー・全関数・全ビュー・リアルタイム配信を
-- DB から機械的に列挙して、ルール違反が 1 件でもあれば NG として出す。
-- 結果が「✅ 問題なし」の 1 行だけなら合格。NG の行が出たら、リリースしてはいけない。
-- 新しいテーブルや関数を追加したら、必ずこれを実行すること。
-- ============================================================
with
tbl as (
  select c.oid, c.relname, c.relkind, c.relrowsecurity, c.reloptions
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
),
pol as (
  select tablename, policyname, cmd, roles::text as roles, coalesce(qual, '') as qual, coalesce(with_check, '') as wc
  from pg_policies where schemaname = 'public'
),
-- 「全員に読ませてよい」と判断済みのポリシー（ここに無い using(true) は NG）
allow_true(name) as (values ('profiles.profiles read')),
-- ログイン済みユーザーが呼んでよい security definer 関数（ここに無いものは NG）
allow_rpc(name) as (values
  ('send_reaction'), ('i_pinned'), ('is_session_member'), ('update_subject'), ('update_last_seen'),
  ('request_study_pair'), ('accept_study_pair'), ('end_study_pair'),
  ('can_access_room'), ('is_me_banned'), ('is_blocked_between'), ('room_has_space')),
-- 列単位で公開してよい profiles の列（これ以外の列が読めたら NG）
allow_profile_cols(name) as (values
  ('id'), ('username'), ('display_name'), ('avatar_url'), ('bio'), ('subject'),
  ('study_streak'), ('total_study_seconds'), ('created_at'), ('goal_exam')),
ng as (
  -- 1. RLS が無効なテーブル
  select '1. RLS が無効' as rule, relname as target from tbl where relkind = 'r' and not relrowsecurity
  -- 2. ログインしていない人（anon / PUBLIC）にテーブル・ビューの権限がある
  union all select '2. 未ログインに権限: ' || string_agg(distinct privilege_type, ','), table_name
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'PUBLIC') group by table_name
  union all select '2. 未ログインに列の権限', table_name
    from information_schema.column_privileges
    where table_schema = 'public' and grantee in ('anon', 'PUBLIC') group by table_name
  -- 3. ログイン済みユーザーに RLS を素通りする権限（TRUNCATE 等）がある
  union all select '3. RLS を素通りする権限: ' || privilege_type, table_name
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
  -- 4. サーバー専用テーブルにログイン済みユーザーの権限がある
  union all select '4. サーバー専用テーブルに権限: ' || privilege_type, table_name
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'authenticated'
      and (table_name in ('banned_providers', 'safety_settings', 'push_subscriptions',
                          'session_invites', 'pin_matches', 'pin_notices', 'pin_events', 'notice_log',
                          'subscriptions', 'billing_consents', 'stripe_events')
           or (table_name in ('room_access', 'scheduled_sessions', 'session_participants') and privilege_type <> 'SELECT'))
  -- 5. profiles の非公開列（provider_id・role・is_banned など）が読める
  union all select '5. 非公開の列が読める: ' || column_name, table_name
    from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated'
      and privilege_type = 'SELECT' and column_name not in (select name from allow_profile_cols)
  -- 6. profiles を直接書き換えられる
  union all select '6. profiles を直接書き換え可: ' || privilege_type, table_name
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  -- 7. 全員（public ロール）向けのポリシー
  union all select '7. 全員向けのポリシー(' || cmd || ')', tablename || '.' || policyname from pol where roles = '{public}' or roles like '%anon%'
  -- 8. 許可リストに無い「条件 true」のポリシー
  union all select '8. 条件が true のポリシー(' || cmd || ')', tablename || '.' || policyname
    from pol where (qual = 'true' or wc = 'true') and tablename || '.' || policyname not in (select name from allow_true)
  -- 9. security definer 関数に search_path が設定されていない
  union all select '9. search_path 未設定の definer 関数', p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  -- 10. 未ログインで実行できる関数
  union all select '10. 未ログインで実行可能な関数', p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')
  -- 11. 許可リストに無い security definer 関数をログイン済みユーザーが実行できる
  union all select '11. 許可されていない definer 関数を実行可能', p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and p.proname not in (select name from allow_rpc)
  -- 12. 見る人の権限で動かないビュー（RLS をすり抜ける）
  union all select '12. security_invoker でないビュー', relname
    from tbl where relkind = 'v' and not coalesce(reloptions::text like '%security_invoker=true%', false)
  -- 13. リアルタイム配信しているのに、読み取りポリシーが無いテーブル
  union all select '13. 配信中なのに SELECT ポリシーなし', pt.tablename
    from pg_publication_tables pt
    where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public'
      and not exists (select 1 from pol where pol.tablename = pt.tablename and pol.cmd in ('SELECT', 'ALL'))
  -- 14. Presence（オンライン表示）用の非公開チャンネルのポリシーが無い
  union all select '14. presence のポリシーなし', 'realtime.messages'
    where (select count(*) from pg_policies where schemaname = 'realtime' and tablename = 'messages'
           and policyname in ('presence read', 'presence write')) < 2
  -- 15. ストレージに誰でも書き込めるポリシーがある
  union all select '15. ストレージに書き込みポリシー(' || cmd || ')', policyname
    from pg_policies where schemaname = 'storage' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
)
select rule as "NG: ルール", target as "対象" from ng
union all
select '✅ 問題なし', '全テーブル・全ポリシー・全関数・全ビュー・リアルタイム配信を点検しました'
where not exists (select 1 from ng)
order by 1, 2;
