-- Schedule sync-fill-missing-images every 15 minutes. It's called once as
-- a side effect of the daily fill-scheduled-content run too, but that
-- alone only touches that day's freshly-drafted slots -- this catches any
-- approval-linked content still missing an image for any other reason
-- (e.g. the legacy OpenAI Batch backlog, or a prior run's failure), a few
-- at a time, on the same reliable synchronous path.

DO $$ BEGIN PERFORM cron.unschedule('sync-fill-missing-images'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'sync-fill-missing-images',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/sync-fill-missing-images',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
