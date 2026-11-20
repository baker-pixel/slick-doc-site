-- First-party traffic analytics replaced GA4; the sync-ga4-analytics function was removed
-- from the repo on 2026-11-11 and its deployed copy is now deleted, so stop the weekly cron.
DO $$ BEGIN PERFORM cron.unschedule('sync-ga4-analytics'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
