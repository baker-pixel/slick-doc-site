-- The sweep also finishes cycles that were planned before the client completed
-- onboarding (business info, mailbox, portal invite), so run it hourly instead
-- of daily. With nothing due it is a handful of cheap queries; planning work
-- per run is capped inside start-client-cycle.
do $$ begin perform cron.unschedule('cycle-rollover-sweep'); exception when others then null; end $$;

select cron.schedule(
  'cycle-rollover-sweep',
  '30 * * * *',
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
