-- Every cron job's net.http_post call except check-image-batches (fixed
-- earlier today) had no explicit timeout_milliseconds, meaning each used
-- pg_net's short default (~5s). check-image-batches was confirmed to have
-- been silently failing for hours because of exactly this -- the cron
-- "succeeded" (the SQL enqueueing the request ran fine) while the actual
-- function never got a chance to finish. fill-scheduled-content is the
-- highest-risk of the rest: it can make up to 50 sequential AI calls in a
-- single run and has almost certainly been getting cut off short every day
-- with no visibility into how much of that day's content actually drafted.
--
-- Timeouts sized to the real workload of each function, not a single
-- blanket value: quick single-purpose functions get 30s, functions that
-- loop over multiple clients or several sequential steps get more.

-- fill-scheduled-content: up to 50 sequential AI-drafting + QA calls/run
DO $$ BEGIN PERFORM cron.unschedule('fill-scheduled-content'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'fill-scheduled-content',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/fill-scheduled-content',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := '{"limit": 50}'::jsonb,
    timeout_milliseconds := 180000
  );
  $$
);

-- publish-scheduled-content: fires postforme-publish-post per due item,
-- each of which may include a synchronous image-generation fallback
DO $$ BEGIN PERFORM cron.unschedule('publish-scheduled-content'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'publish-scheduled-content',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/publish-scheduled-content',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- daily/weekly-client-reports: run-ai-batch loops over every active client
DO $$ BEGIN PERFORM cron.unschedule('daily-client-automation'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'daily-client-automation',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/run-ai-batch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := '{"batchType": "daily"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

DO $$ BEGIN PERFORM cron.unschedule('weekly-client-reports'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'weekly-client-reports',
  '0 8 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/run-ai-batch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := '{"batchType": "weekly"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- monthly-client-reports: same loop, plus real report generation (heavier per client)
DO $$ BEGIN PERFORM cron.unschedule('monthly-client-reports'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'monthly-client-reports',
  '0 7 1 * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/run-ai-batch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := '{"batchType": "monthly"}'::jsonb,
    timeout_milliseconds := 180000
  );
  $$
);

-- auto-schedule-content: simple insert logic, but touches every active client
DO $$ BEGIN PERFORM cron.unschedule('auto-schedule-content'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'auto-schedule-content',
  '0 6 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/auto-schedule-content',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- check-alerts, check-stalled-workflows, detect-inactive-leads: quick, single-purpose
DO $$ BEGIN PERFORM cron.unschedule('check-alerts'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'check-alerts',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/check-alerts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

DO $$ BEGIN PERFORM cron.unschedule('check-stalled-workflows'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'check-stalled-workflows',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/check-stalled-workflows',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

DO $$ BEGIN PERFORM cron.unschedule('detect-inactive-leads'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'detect-inactive-leads',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/detect-inactive-leads',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- process-agent-jobs, process-email-queue, run-prospect-drip, send-approval-reminders:
-- loop over a small queue/batch each run, moderate budget
DO $$ BEGIN PERFORM cron.unschedule('process-agent-jobs'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'process-agent-jobs',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/process-agent-jobs',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

DO $$ BEGIN PERFORM cron.unschedule('process-email-queue'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'process-email-queue',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/process-email-queue',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

DO $$ BEGIN PERFORM cron.unschedule('run-prospect-drip'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'run-prospect-drip',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/run-prospect-drip',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

DO $$ BEGIN PERFORM cron.unschedule('send-approval-reminders'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'send-approval-reminders',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/send-approval-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
