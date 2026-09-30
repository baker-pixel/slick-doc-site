-- backfill-prospect-context (website context, Apollo email lookup, ICP fit
-- scoring) only ran when a discovery run happened to trigger it. Prospects
-- that missed that trigger, or whose email lookup was skipped, sat un-enriched
-- indefinitely (17 discovered prospects had no email and no lookup attempt).
-- Sweep every 3 hours. Bounded per run (25 Apollo lookups, 20 scorings, 50
-- scans) and lookups are not repeated for 14 days.
do $$ begin perform cron.unschedule('backfill-prospect-context'); exception when others then null; end $$;

select cron.schedule(
  'backfill-prospect-context',
  '17 */3 * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/backfill-prospect-context',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key(),
      'x-internal-secret', (select value from public.internal_secrets where key = 'pipeline_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $cmd$
);
