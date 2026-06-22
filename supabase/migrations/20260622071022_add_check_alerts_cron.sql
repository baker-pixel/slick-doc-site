-- Schedule check-alerts to run every 30 minutes.
-- Sends a Resend digest email to the admin when unacknowledged error/warning
-- alerts exist in automation_alerts, then marks them acknowledged_at.

DO $$ BEGIN PERFORM cron.unschedule('check-alerts'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'check-alerts',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/check-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := '{}'::jsonb
  );
  $$
);