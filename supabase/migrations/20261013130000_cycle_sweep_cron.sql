-- Daily safety net for cycle rollover: plans any paid client whose current
-- billing period has no cycle yet (missed/raced webhook, a client that was
-- paused when the invoice landed and has since resumed, first rollout).
-- start-client-cycle caps work per run, so a backlog drains over several days.
do $$ begin perform cron.unschedule('cycle-rollover-sweep'); exception when others then null; end $$;

select cron.schedule(
  'cycle-rollover-sweep',
  '30 5 * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/start-client-cycle',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key(),
      'x-internal-secret', (select value from public.internal_secrets where key = 'pipeline_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $cmd$
);
