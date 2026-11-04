-- Lead enrichment (website scan -> ICP fit score -> Apollo email -> auto-approve)
-- used to run every 3 hours. Each pass scores at most 20 leads and looks up at
-- most 25 emails, so a day's discovery (up to ~20 leads per client) needed
-- several passes and took most of a day to reach the approval step. Passes are
-- cheap when there is nothing to do (a few selects), so run every 30 minutes.
-- Discovery also triggers a pass straight after it finds leads.
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'backfill-prospect-context';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(v_jobid, schedule := '7,37 * * * *');
  END IF;
END $$;
