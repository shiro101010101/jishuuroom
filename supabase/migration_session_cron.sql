-- ============================================================
-- 勉強会の開始前通知を 5 分おきに動かす（migration_study_groups.sql の後に実行）
-- Vercel の無料プランは Cron が 1 日 1 回までなので、Supabase の pg_cron から
-- /api/cron/sessions を呼ぶ。URL と合言葉（Vercel の CRON_SECRET と同じ値）は Vault に暗号化して置く
--
-- ★ 実行前に、下の 2 か所の '...' を書き換えてください
--    ・app_url     … 本番の URL（例 https://example.vercel.app）。最後の / は付けない
--    ・cron_secret … Vercel の環境変数 CRON_SECRET と同じ値
-- 2 回目以降に実行しても大丈夫です（値は上書きされます）
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  v_url    text := 'https://ここに本番のURL';
  v_secret text := 'ここにCRON_SECRETの値';
begin
  if v_url like '%ここに%' or v_secret like '%ここに%' then
    raise exception 'app_url と cron_secret を書き換えてから実行してください';
  end if;
  if exists (select 1 from vault.secrets where name = 'app_url') then
    perform vault.update_secret((select id from vault.secrets where name = 'app_url'), v_url);
  else
    perform vault.create_secret(v_url, 'app_url');
  end if;
  if exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.update_secret((select id from vault.secrets where name = 'cron_secret'), v_secret);
  else
    perform vault.create_secret(v_secret, 'cron_secret');
  end if;
end $$;

-- 同じ名前のジョブがあれば置き換える
select cron.unschedule('session-reminders') where exists (select 1 from cron.job where jobname = 'session-reminders');
select cron.schedule('session-reminders', '*/5 * * * *', $job$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/sessions',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$job$);

-- 動作確認：直近の実行結果（status_code が 200 なら OK）
-- select id, status_code, left(content, 200), created from net._http_response order by created desc limit 5;
