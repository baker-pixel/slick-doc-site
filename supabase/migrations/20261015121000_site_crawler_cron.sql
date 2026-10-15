-- Runs the crawl worker every minute. Each run claims at most one crawl for ~100s and
-- hands it back, so a crawl of any size advances steadily and overlapping runs work on
-- different crawls (the lease in claim_site_crawl prevents two workers on one crawl).
do $$ begin perform cron.unschedule('process-site-crawl'); exception when others then null; end $$;

select cron.schedule(
  'process-site-crawl',
  '* * * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/process-site-crawl',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key(),
      'x-internal-secret', (select value from public.internal_secrets where key = 'pipeline_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
  -- Nothing to do unless a crawl is waiting or running: skip the invocation entirely.
  WHERE EXISTS (SELECT 1 FROM public.site_crawls WHERE status IN ('queued', 'running'));
  $cmd$
);
