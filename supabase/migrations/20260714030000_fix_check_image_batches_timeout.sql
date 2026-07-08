-- check-image-batches was silently stuck: net.http_post has no explicit
-- timeout_milliseconds, so it uses pg_net's default (~5s) -- but applying
-- even one image (download, decode, upload to storage) takes ~19s.
-- Confirmed directly via net._http_response: every 30-min cron firing for
-- this job shows timed_out=true, status_code=null -- the request was
-- abandoned before the function ever got a chance to finish, every time,
-- since the job was created. Not a resource-limit crash this time (that
-- was a real, separate issue already fixed) -- this is a plain timeout
-- misconfiguration. Raise it well above the observed ~19s.

DO $$ BEGIN PERFORM cron.unschedule('check-image-batches'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'check-image-batches',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/check-image-batches',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
