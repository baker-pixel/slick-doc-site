-- Wire up two autonomous functions that had no cron triggering them.
--
-- check-stalled-workflows: marks n8n workflow steps as failed when the
--   callback deadline passes — needs to run frequently or timeouts go undetected.
--
-- detect-inactive-leads: finds leads with no activity for 14+ days and queues
--   re-engagement email sequences — daily run is sufficient.

DO $$ BEGIN PERFORM cron.unschedule('check-stalled-workflows'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'check-stalled-workflows',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/check-stalled-workflows',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := '{}'::jsonb
  );
  $$
);

DO $$ BEGIN PERFORM cron.unschedule('detect-inactive-leads'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'detect-inactive-leads',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/detect-inactive-leads',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := '{}'::jsonb
  );
  $$
);
