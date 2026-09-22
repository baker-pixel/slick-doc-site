-- Schedule poll-client-mailboxes: checks each verified client SMTP mailbox
-- for bounces/replies via IMAP, since those never touch Resend's webhook and
-- would otherwise go completely undetected (see the "Address not found"
-- bounce that motivated this).

DO $$ BEGIN PERFORM cron.unschedule('poll-client-mailboxes'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'poll-client-mailboxes',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/poll-client-mailboxes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := '{}'::jsonb
  );
  $$
);
