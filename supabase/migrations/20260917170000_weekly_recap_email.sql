-- Weekly recap email opt-in per portal user, surfaced as a toggle on the
-- Home tab ("You get this recap by email every Monday at 8am") and in
-- Settings > Notifications.
ALTER TABLE public.client_portal_preferences
  ADD COLUMN IF NOT EXISTS weekly_recap_email boolean NOT NULL DEFAULT true;

-- Monday 8am UTC (three hours after the sync-ga4-analytics pull that feeds
-- it, so the traffic number is fresh): send-weekly-recap emails each active
-- client a real website-traffic + leads recap, sourced from client_analytics
-- and prospects -- no invented numbers. Same net.http_post + anon-key
-- pattern as the other weekly crons.
DO $$ BEGIN PERFORM cron.unschedule('weekly-portal-recap'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'weekly-portal-recap',
  '0 8 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/send-weekly-recap',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := '{}'::jsonb
  );
  $$
);
