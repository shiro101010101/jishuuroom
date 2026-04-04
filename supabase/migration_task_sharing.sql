-- ============================================================
-- Migration: タスク共有 & 一緒に勉強中ペア機能
-- Supabase SQL Editor で実行してください
-- ============================================================

-- tasks テーブルに共有フラグを追加
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_shared boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS share_scope text DEFAULT 'private';
  -- share_scope: 'private' | 'friends' | 'room'

-- Enable realtime for tasks
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;

-- ============================================================
-- STUDY PAIRS (一緒に勉強中ペア)
-- フレンド承認後、互いに「一緒に勉強中」と表示できる
-- ============================================================
CREATE TABLE IF NOT EXISTS public.study_pairs (
  id            uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_a        uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b        uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  status        text DEFAULT 'pending',  -- 'pending' | 'active' | 'ended'
  requested_by  uuid REFERENCES public.profiles(id),
  created_at    timestamptz DEFAULT now(),
  activated_at  timestamptz,
  UNIQUE(user_a, user_b),
  CHECK(user_a < user_b)  -- 重複防止
);

ALTER TABLE public.study_pairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own pairs" ON public.study_pairs
  FOR SELECT USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "Users can manage their own pairs" ON public.study_pairs
  FOR ALL USING (auth.uid() = user_a OR auth.uid() = user_b);

ALTER PUBLICATION supabase_realtime ADD TABLE public.study_pairs;

-- ============================================================
-- SHARED TASKS VIEW
-- フレンドや同室ユーザーの共有タスクを見るビュー
-- ============================================================
CREATE OR REPLACE VIEW public.shared_tasks_view AS
SELECT
  t.id,
  t.user_id,
  t.title,
  t.completed,
  t.created_at,
  t.completed_at,
  t.is_shared,
  t.share_scope,
  p.display_name,
  p.avatar_url
FROM public.tasks t
JOIN public.profiles p ON p.id = t.user_id
WHERE t.is_shared = true
  AND t.share_scope IN ('friends', 'room');

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- ペアリクエストを送る (friendship が accepted の場合のみ)
CREATE OR REPLACE FUNCTION public.request_study_pair(partner_id uuid)
RETURNS void AS $$
DECLARE
  a uuid := LEAST(auth.uid(), partner_id);
  b uuid := GREATEST(auth.uid(), partner_id);
  is_friend boolean;
BEGIN
  -- フレンドかどうか確認
  SELECT EXISTS(
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
    AND (
      (requester_id = auth.uid() AND addressee_id = partner_id)
      OR
      (requester_id = partner_id AND addressee_id = auth.uid())
    )
  ) INTO is_friend;

  IF NOT is_friend THEN
    RAISE EXCEPTION 'フレンドのみにペアリクエストを送れます';
  END IF;

  INSERT INTO public.study_pairs (user_a, user_b, requested_by, status)
  VALUES (a, b, auth.uid(), 'pending')
  ON CONFLICT (user_a, user_b) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ペアを承認する
CREATE OR REPLACE FUNCTION public.accept_study_pair(partner_id uuid)
RETURNS void AS $$
DECLARE
  a uuid := LEAST(auth.uid(), partner_id);
  b uuid := GREATEST(auth.uid(), partner_id);
BEGIN
  UPDATE public.study_pairs
  SET status = 'active', activated_at = now()
  WHERE user_a = a AND user_b = b
    AND requested_by != auth.uid()  -- 相手からのリクエストのみ承認可能
    AND status = 'pending';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ペアを終了する
CREATE OR REPLACE FUNCTION public.end_study_pair(partner_id uuid)
RETURNS void AS $$
DECLARE
  a uuid := LEAST(auth.uid(), partner_id);
  b uuid := GREATEST(auth.uid(), partner_id);
BEGIN
  UPDATE public.study_pairs
  SET status = 'ended'
  WHERE user_a = a AND user_b = b;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
