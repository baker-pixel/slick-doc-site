-- Phase 4: cron for the agent_jobs queue worker. Runs every minute -- this
-- replaces advance-workflow's fire-and-forget dispatch, so latency here
-- directly affects how fast an onboarding step advances after unlocking.

DO $$ BEGIN PERFORM cron.unschedule('process-agent-jobs'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'process-agent-jobs',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/process-agent-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := '{}'::jsonb
  );
  $$
);
