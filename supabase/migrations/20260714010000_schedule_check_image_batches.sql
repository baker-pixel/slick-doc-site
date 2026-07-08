-- Schedule check-image-batches to run every 30 minutes.
-- Polls OpenAI Batch API for pending social-post image generation jobs
-- (submitted by generate-social-images-batch, itself called from
-- fill-scheduled-content's daily run) and, once a batch completes, downloads
-- the images and attaches them to their content_calendar rows.

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
    body := '{}'::jsonb
  );
  $$
);
