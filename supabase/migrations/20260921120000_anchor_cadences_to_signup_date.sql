-- Anchor recurring "monthly" work to each client's own signup date
-- (client_accounts.onboarded_at, falling back to created_at) instead of the
-- calendar 1st, matching how billing periods actually roll (see project
-- chat). Two changes:
--
--   1. Track when a client's social content pillars were last generated, so
--      client-context-refresh (Phase D, weekly) can regenerate them ~30d
--      after generation instead of only ever once (first-project-creation).
--      Existing social projects backfill to their created_at so the clock
--      starts now rather than regenerating every client on the next pass.
--
--   2. Switch the AI-visibility probe (Phase D/tier gate) from "every client,
--      same day (the 1st)" to a daily poll that only probes a client once
--      their last score is >=30d old -- the same cadence pattern
--      seo-reaudit-scan already uses. This naturally staggers probes by each
--      client's own signup date instead of bursting everyone on one day.

ALTER TABLE public.client_projects ADD COLUMN IF NOT EXISTS pillars_generated_at TIMESTAMP WITH TIME ZONE;

UPDATE public.client_projects
SET pillars_generated_at = created_at
WHERE kind = 'social' AND pillars_generated_at IS NULL;

DO $$ BEGIN PERFORM cron.unschedule('run-ai-visibility-probes'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'run-ai-visibility-probes',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/run-ai-visibility-probes',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := '{}'::jsonb,
    timeout_milliseconds := 280000
  );
  $$
);
