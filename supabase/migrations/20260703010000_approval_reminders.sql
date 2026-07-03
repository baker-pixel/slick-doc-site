-- Approval reminder emails: track when a client was last nudged about
-- a draft sitting in pending_review, and run the reminder daily.

ALTER TABLE public.content_approvals
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

DO $$ BEGIN PERFORM cron.unschedule('send-approval-reminders'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Daily at 14:00 UTC (~9-10am US Eastern)
SELECT cron.schedule(
  'send-approval-reminders',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/send-approval-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := '{}'::jsonb
  );
  $$
);
