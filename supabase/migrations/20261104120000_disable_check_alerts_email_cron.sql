-- Stop the 30-minute check-alerts email digest. It re-sent the same
-- unacknowledged errors until someone acknowledged them, which was noise;
-- alerts stay visible in the admin panel (Alerts section + sidebar badge).
-- The check-alerts function is left deployed and dormant. To bring the email
-- back, re-run the cron.schedule block from 20260714040000_add_cron_timeouts.sql.
DO $$ BEGIN PERFORM cron.unschedule('check-alerts'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
