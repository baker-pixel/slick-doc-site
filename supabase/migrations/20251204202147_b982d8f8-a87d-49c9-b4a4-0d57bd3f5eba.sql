-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule email queue processor to run every 5 minutes
SELECT cron.schedule(
  'process-email-queue',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://dnwbdnwbwwoxiswzzikg.supabase.co/functions/v1/process-email-queue',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRud2Jkbndid3dveGlzd3p6aWtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MDA1MTQsImV4cCI6MjA4MDI3NjUxNH0.amvnQ2awpqfha73plLyIRviB7FnsfkaY4ZaQPp84CPI"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);