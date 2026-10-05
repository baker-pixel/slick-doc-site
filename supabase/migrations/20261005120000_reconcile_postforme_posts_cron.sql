-- publish-post marks a row "published" when Post for Me accepts it, but the
-- platform can reject it afterwards (e.g. Facebook error 190, missing page
-- permissions) and the postforme-webhook was not reporting that, so failed
-- posts looked published. Pull the real per-account result every 10 minutes
-- for posts nothing has confirmed yet.
do $$ begin perform cron.unschedule('reconcile-postforme-posts'); exception when others then null; end $$;

select cron.schedule(
  'reconcile-postforme-posts',
  '*/10 * * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/reconcile-postforme-posts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key(),
      'x-internal-secret', (select value from public.internal_secrets where key = 'pipeline_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cmd$
);
