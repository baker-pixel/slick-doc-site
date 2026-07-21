-- Daily cron to keep every client's prospect pipeline topped up automatically.
-- auto-discover-prospects loops active, prospecting-enabled clients and runs
-- ICP-driven discovery (Maps or web search) for any whose review queue is
-- thin, skipping ones that ran recently. Runs once a day at 09:00 UTC.

DO $$ BEGIN PERFORM cron.unschedule('auto-discover-prospects'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'auto-discover-prospects',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/auto-discover-prospects',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
