-- Add hourly cron to drive prospect drip emails.
-- run-prospect-drip moves pending→nurture after 48h and sends
-- scheduled drip emails at day 2, 4, 7, 10 — it never fired without this.

DO $$ BEGIN PERFORM cron.unschedule('run-prospect-drip'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'run-prospect-drip',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/run-prospect-drip',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := '{}'::jsonb
  );
  $$
);
