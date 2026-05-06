-- Fix publish-scheduled-content cron — previous migration used wrong project URL
-- (dnwbdnwbwwoxiswzzikg instead of axbeaqpjyzzmbvyaofbn).

DO $$ BEGIN PERFORM cron.unschedule('publish-scheduled-content'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'publish-scheduled-content',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/publish-scheduled-content',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := '{}'::jsonb
  );
  $$
);
