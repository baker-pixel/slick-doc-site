-- run-ai-visibility-probes was reachable by anyone holding the public anon key
-- (verify_jwt only checks that the bearer is a valid JWT, and the anon key is
-- shipped in the frontend). Each call can spend LLM credits probing clients
-- that are due, so require the same pipeline_cron internal secret the other
-- pipeline crons already send. The function now rejects calls without it.
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'run-ai-visibility-probes';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(v_jobid, command := $cmd$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/run-ai-visibility-probes',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key(),
      'x-internal-secret', (select value from public.internal_secrets where key = 'pipeline_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 280000
  );
  $cmd$);
  END IF;
END $$;
