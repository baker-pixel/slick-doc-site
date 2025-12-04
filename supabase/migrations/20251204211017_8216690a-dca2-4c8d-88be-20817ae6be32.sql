-- Add timezone support to email_queue
ALTER TABLE public.email_queue 
ADD COLUMN IF NOT EXISTS recipient_timezone TEXT DEFAULT 'America/New_York',
ADD COLUMN IF NOT EXISTS optimal_send_time BOOLEAN DEFAULT false;

-- Create index for timezone-aware scheduling
CREATE INDEX IF NOT EXISTS idx_email_queue_scheduled_timezone ON public.email_queue(scheduled_for, recipient_timezone);

-- Add function to calculate optimal send time based on engagement data
CREATE OR REPLACE FUNCTION public.get_optimal_send_hour(p_timezone TEXT DEFAULT 'America/New_York')
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  best_hour INTEGER;
BEGIN
  -- Analyze tracking events to find best hour for opens
  SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE p_timezone)::INTEGER INTO best_hour
  FROM email_tracking_events
  WHERE event_type = 'open'
  GROUP BY EXTRACT(HOUR FROM created_at AT TIME ZONE p_timezone)
  ORDER BY COUNT(*) DESC
  LIMIT 1;
  
  -- Default to 10 AM if no data
  IF best_hour IS NULL THEN
    best_hour := 10;
  END IF;
  
  RETURN best_hour;
END;
$$;