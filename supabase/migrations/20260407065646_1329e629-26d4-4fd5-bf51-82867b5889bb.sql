-- Remove duplicate ai-batch cron jobs (daily-client-automation, weekly-client-reports, monthly-client-reports already cover these)
DO $$ BEGIN PERFORM cron.unschedule('ai-batch-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('ai-batch-weekly'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('ai-batch-monthly'); EXCEPTION WHEN OTHERS THEN NULL; END $$;