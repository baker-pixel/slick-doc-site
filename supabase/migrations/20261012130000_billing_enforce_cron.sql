-- Hourly billing sweep: pauses clients whose grace window ended (or who never
-- subscribed) and resumes any that were paused for billing and are now paid.
do $$ begin perform cron.unschedule('billing-enforce'); exception when others then null; end $$;

select cron.schedule(
  'billing-enforce',
  '7 * * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/billing-enforce',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key(),
      'x-internal-secret', (select value from public.internal_secrets where key = 'pipeline_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cmd$
);
