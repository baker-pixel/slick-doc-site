-- Remove duplicate ai-batch cron jobs (daily-client-automation, weekly-client-reports, monthly-client-reports already cover these)
SELECT cron.unschedule('ai-batch-daily');
SELECT cron.unschedule('ai-batch-weekly');
SELECT cron.unschedule('ai-batch-monthly');