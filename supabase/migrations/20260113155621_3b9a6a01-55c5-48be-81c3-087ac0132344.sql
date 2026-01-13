-- Create cron job for daily automation (runs at 9 AM UTC)
SELECT cron.schedule(
  'daily-client-automation',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://dnwbdnwbwwoxiswzzikg.supabase.co/functions/v1/run-ai-batch',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRud2Jkbndid3dveGlzd3p6aWtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MDA1MTQsImV4cCI6MjA4MDI3NjUxNH0.amvnQ2awpqfha74plLyIRviB7FnsfkaY4ZaQPp84CPI"}'::jsonb,
    body := '{"batchType": "daily"}'::jsonb
  );
  $$
);

-- Create cron job for weekly reports (runs Monday at 8 AM UTC)
SELECT cron.schedule(
  'weekly-client-reports',
  '0 8 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://dnwbdnwbwwoxiswzzikg.supabase.co/functions/v1/run-ai-batch',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRud2Jkbndid3dveGlzd3p6aWtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MDA1MTQsImV4cCI6MjA4MDI3NjUxNH0.amvnQ2awpqfha74plLyIRviB7FnsfkaY4ZaQPp84CPI"}'::jsonb,
    body := '{"batchType": "weekly"}'::jsonb
  );
  $$
);

-- Create cron job for monthly reports (runs 1st of month at 7 AM UTC)
SELECT cron.schedule(
  'monthly-client-reports',
  '0 7 1 * *',
  $$
  SELECT net.http_post(
    url := 'https://dnwbdnwbwwoxiswzzikg.supabase.co/functions/v1/run-ai-batch',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRud2Jkbndid3dveGlzd3p6aWtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MDA1MTQsImV4cCI6MjA4MDI3NjUxNH0.amvnQ2awpqfha74plLyIRviB7FnsfkaY4ZaQPp84CPI"}'::jsonb,
    body := '{"batchType": "monthly"}'::jsonb
  );
  $$
);