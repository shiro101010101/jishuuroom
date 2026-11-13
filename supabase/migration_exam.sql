-- ============================================================
-- 目標の試験（migration_least_privilege.sql の後に実行）
--   ・profiles.goal_exam：ロビーの初回カードで選ぶ「あなたの目標」。プロフィール・ランキングに表示する公開情報
--   ・書き込みはサーバー（/api/profile/goal）が service_role で行うだけ。ログイン済みユーザーに UPDATE は渡さない
--   ・「同じ目標」ランキングは /api/leaderboard（service_role）が既存の get_leaderboard を p_user_ids つきで呼ぶ。新しい RPC は無し
-- 実行後、supabase/tests/security_audit.sql が「✅ 問題なし」の 1 行だけになることを確認する
-- ============================================================

alter table public.profiles add column if not exists goal_exam text;

-- 決まった値だけ（lib/exams.ts の EXAMS と同じ一覧）
alter table public.profiles drop constraint if exists profiles_goal_exam_check;
alter table public.profiles add constraint profiles_goal_exam_check check (
  goal_exam is null or goal_exam in (
    'kyotsu', 'juken', 'koko', 'teiki', 'eiken', 'toeic', 'boki', 'takken', 'fp', 'it', 'komuin', 'other'
  )
);

-- 「同じ目標」ランキング用（サーバーが goal_exam で絞り込む）
create index if not exists profiles_goal_exam_idx on public.profiles (goal_exam) where goal_exam is not null;

-- 公開してよい列として読み取りを許可（列単位。privacy の grant に goal_exam を追加したもの）
revoke select, insert, update, delete on public.profiles from authenticated;
grant select (id, username, display_name, avatar_url, bio, subject, study_streak, total_study_seconds, created_at, goal_exam)
  on public.profiles to authenticated;
-- 未ログインには何も渡さない（念のため）
revoke all on public.profiles from anon;
