-- The prospect-pipeline crons called their edge functions with only the public
-- anon key. The functions now require the private pipeline_cron secret (same
-- pattern as the social pipeline crons), so the crons must send it.
select cron.alter_job((select jobid from cron.job where jobname = 'auto-discover-prospects'), command := $cmd$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/auto-discover-prospects',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key(),
      'x-internal-secret', (select value from public.internal_secrets where key = 'pipeline_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cmd$);

select cron.alter_job((select jobid from cron.job where jobname = 'run-prospect-drip'), command := $cmd$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/run-prospect-drip',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key(),
      'x-internal-secret', (select value from public.internal_secrets where key = 'pipeline_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cmd$);

select cron.alter_job((select jobid from cron.job where jobname = 'process-email-queue'), command := $cmd$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/process-email-queue',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key(),
      'x-internal-secret', (select value from public.internal_secrets where key = 'pipeline_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cmd$);

select cron.alter_job((select jobid from cron.job where jobname = 'poll-client-mailboxes'), command := $cmd$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/poll-client-mailboxes',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key(),
      'x-internal-secret', (select value from public.internal_secrets where key = 'pipeline_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cmd$);
