-- Wire up the automatic content generation + publishing pipeline.
--
-- Pipeline order:
--   1. auto-schedule-content  (Mon 6am) — creates placeholder calendar slots for all active clients
--   2. fill-scheduled-content (Mon 7am) — fills placeholders with AI-generated copy, sets client_approved=true
--   3. publish-scheduled-content (every 15 min, already active) — publishes due scheduled items
--
-- fill-scheduled-content also runs daily at 7am to catch any remaining unfilled slots from the week.

DO $$ BEGIN PERFORM cron.unschedule('auto-schedule-content'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'auto-schedule-content',
  '0 6 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/auto-schedule-content',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := '{}'::jsonb
  );
  $$
);

DO $$ BEGIN PERFORM cron.unschedule('fill-scheduled-content'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'fill-scheduled-content',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/fill-scheduled-content',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := '{"limit": 50}'::jsonb
  );
  $$
);
