-- Update process-email-queue from every 15 min to every 10 min
SELECT cron.unschedule('process-email-queue');

SELECT cron.schedule(
  'process-email-queue',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://dnwbdnwbwwoxiswzzikg.supabase.co/functions/v1/process-email-queue',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRud2Jkbndid3dveGlzd3p6aWtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MDA1MTQsImV4cCI6MjA4MDI3NjUxNH0.amvnQ2awpqfha74plLyIRviB7FnsfkaY4ZaQPp84CPI"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);