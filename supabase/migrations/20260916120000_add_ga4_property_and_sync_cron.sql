-- Per-client GA4 property so website traffic can be pulled automatically
-- instead of an admin typing it into client_analytics by hand every week.
ALTER TABLE public.client_accounts ADD COLUMN IF NOT EXISTS ga4_property_id text;

-- Weekly pull: every Monday 5am UTC, sync-ga4-analytics sweeps every active
-- client with a ga4_property_id set and upserts a client_analytics row for
-- the trailing 7-day window. Same net.http_post + anon-key pattern as the
-- existing check-alerts cron.
DO $$ BEGIN PERFORM cron.unschedule('sync-ga4-analytics'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'sync-ga4-analytics',
  '0 5 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/sync-ga4-analytics',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := '{}'::jsonb
  );
  $$
);
