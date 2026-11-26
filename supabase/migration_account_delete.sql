-- ============================================================
-- 退会（アカウント削除）に対応する。migration_hardening_v2.sql の後に実行。何度実行しても大丈夫
-- アプリストア（Apple / Google）は、アプリの中から退会できることを必須にしている。
-- profiles を消すときに「何もしない」設定の外部キーがあると削除が止まるので、空にする（set null）に変える。
--   通報の記録は、退会後も証拠として残す（誰の通報かは空になる）
-- ============================================================
do $$
declare r record;
begin
  for r in select * from (values
    ('profiles',         'banned_by',    'profiles_banned_by_fkey'),
    ('banned_providers', 'banned_by',    'banned_providers_banned_by_fkey'),
    ('rooms',            'created_by',   'rooms_created_by_fkey'),
    ('reports',          'reporter_id',  'reports_reporter_id_fkey'),
    ('reports',          'reported_id',  'reports_reported_id_fkey'),
    ('reports',          'reviewed_by',  'reports_reviewed_by_fkey'),
    ('study_pairs',      'requested_by', 'study_pairs_requested_by_fkey')
  ) as t(tbl, col, con)
  loop
    execute format('alter table public.%I drop constraint if exists %I', r.tbl, r.con);
    execute format('alter table public.%I add constraint %I foreign key (%I) references public.profiles(id) on delete set null', r.tbl, r.con, r.col);
  end loop;
end $$;
