-- Learns each client's photographic look from their website. Runs daily; each
-- run handles a few clients that have no brief yet (or one older than 90 days),
-- so every client is covered within days without a burst of vision calls.
do $$ begin perform cron.unschedule('extract-visual-brief'); exception when others then null; end $$;

select cron.schedule(
  'extract-visual-brief',
  '40 8 * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/extract-visual-brief',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key(),
      'x-internal-secret', (select value from public.internal_secrets where key = 'pipeline_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cmd$
);
