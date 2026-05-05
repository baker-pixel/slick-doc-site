-- Add cron job to fire publish-scheduled-content every 15 minutes.
-- This was missing — handle-approval inserts into content_calendar with
-- client_approved=true but nothing was ever calling publish-scheduled-content.

SELECT cron.schedule(
  'publish-scheduled-content',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://dnwbdnwbwwoxiswzzikg.supabase.co/functions/v1/publish-scheduled-content',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := '{}'::jsonb
  );
  $$
);
