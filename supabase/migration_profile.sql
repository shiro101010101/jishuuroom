-- ============================================================
-- プロフィール：自己紹介文とプロフィール画像（migration_security.sql の後に実行）
-- 画像のアップロードはサーバー（/api/profile）が service_role で行うので、
-- バケットは「誰でも見られる・書き込みはサーバーだけ」の設定で十分
-- ============================================================

alter table public.profiles add column if not exists bio text;
alter table public.profiles drop constraint if exists profiles_bio_length;
alter table public.profiles add constraint profiles_bio_length check (char_length(bio) <= 160);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
