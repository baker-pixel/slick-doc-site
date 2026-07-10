-- The feedback channel's heartbeat. Weekly, pull-based: refine each client's
-- shared context from recent outcomes and ensure their Social Media Plan
-- exists. Writes only to context/projects; triggers no downstream work --
-- agents pick up the refined context on their own next run. Monday 9am, after
-- the weekly reports (8am) so it learns from the freshest reporting window.

DO $$ BEGIN PERFORM cron.unschedule('client-context-refresh'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'client-context-refresh',
  '0 9 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/client-context-refresh',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := '{}'::jsonb,
    timeout_milliseconds := 280000
  );
  $$
);
