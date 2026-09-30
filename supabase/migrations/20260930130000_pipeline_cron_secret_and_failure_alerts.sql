-- 1. The four social-pipeline crons called their edge functions with only the
--    public anon key and the functions had no auth, so anyone with the anon key
--    could trigger paid AI work. The crons now send a private secret (same
--    internal_secrets table as the gap-analysis trigger; RLS on, no policies).
insert into public.internal_secrets (key, value)
values ('pipeline_cron', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

select cron.alter_job(28, command := $cmd$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/fill-scheduled-content',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key(),
      'x-internal-secret', (select value from public.internal_secrets where key = 'pipeline_cron')),
    body := '{"limit": 50}'::jsonb,
    timeout_milliseconds := 180000
  );
$cmd$);

select cron.alter_job(29, command := $cmd$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/publish-scheduled-content',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key(),
      'x-internal-secret', (select value from public.internal_secrets where key = 'pipeline_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$cmd$);

select cron.alter_job(33, command := $cmd$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/auto-schedule-content',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key(),
      'x-internal-secret', (select value from public.internal_secrets where key = 'pipeline_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$cmd$);

select cron.alter_job(41, command := $cmd$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/sync-fill-missing-images',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key(),
      'x-internal-secret', (select value from public.internal_secrets where key = 'pipeline_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$cmd$);

-- 2. cron.job_run_details only says the HTTP call was *queued*; a 401/500 from
--    the function was invisible (publishing was 100% broken 24 Sep - 30 Sep with
--    every cron run "succeeded"). Surface real HTTP errors as automation_alerts.
create or replace function public.report_failed_cron_http_calls()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  sample text;
begin
  select count(*), left(max(content::text), 300)
    into n, sample
  from net._http_response
  where created > now() - interval '30 minutes'
    and status_code >= 400;

  if n > 0 then
    insert into public.automation_alerts (alert_type, severity, title, message, source, metadata)
    values (
      'cron_http_failure', 'error',
      n || ' scheduled edge-function call(s) returned an HTTP error',
      'In the last 30 minutes ' || n || ' pg_net/cron calls got a 4xx/5xx response. Sample body: ' || coalesce(sample, ''),
      'report_failed_cron_http_calls',
      jsonb_build_object('count', n)
    );
  end if;
end;
$$;

select cron.schedule('report-failed-cron-http-calls', '*/30 * * * *', $$select public.report_failed_cron_http_calls();$$);
