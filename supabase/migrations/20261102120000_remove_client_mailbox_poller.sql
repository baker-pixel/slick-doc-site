-- Replies now arrive via the Resend inbound webhook (replies+<tracking_id>@
-- replies.orangedoormarketing.com), so the IMAP poller over client mailboxes
-- is gone. Bounces to client SMTP mailboxes are no longer detected (accepted).
-- poll_runs and prospect_replies are kept as history.
DO $$ BEGIN PERFORM cron.unschedule('poll-client-mailboxes'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
