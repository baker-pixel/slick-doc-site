-- Phase E — close the loop. Daily scan that re-audits clients whose last SEO
-- audit is older than their tier's re-audit cadence (tierPolicy). Runs a few
-- per invocation; each fix applied then gets re-verified on the next re-audit
-- (the project reconciliation flips a resolved milestone to completed).

DO $$ BEGIN PERFORM cron.unschedule('seo-reaudit-scan'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'seo-reaudit-scan',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/seo-reaudit-scan',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := '{}'::jsonb,
    timeout_milliseconds := 280000
  );
  $$
);
