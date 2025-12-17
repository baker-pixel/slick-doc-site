-- Add Hot Lead pipeline stage
INSERT INTO pipeline_stages (name, stage_order) 
VALUES ('Hot Lead', 3.5)
ON CONFLICT DO NOTHING;

-- Update stage orders to make room
UPDATE pipeline_stages SET stage_order = 4 WHERE name = 'Engaged';
UPDATE pipeline_stages SET stage_order = 5 WHERE name = 'Qualified';
UPDATE pipeline_stages SET stage_order = 6 WHERE name = 'Customer';

-- Ensure Hot Lead has correct order
UPDATE pipeline_stages SET stage_order = 3 WHERE name = 'Hot Lead';

-- Add last_activity_at column to contact_submissions for tracking
ALTER TABLE contact_submissions 
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create trigger function for new_lead sequence
CREATE OR REPLACE FUNCTION public.trigger_new_lead_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM net.http_post(
    url := 'https://dnwbdnwbwwoxiswzzikg.supabase.co/functions/v1/queue-sequence-emails',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRud2Jkbndid3dveGlzd3p6aWtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MDA1MTQsImV4cCI6MjA4MDI3NjUxNH0.amvnQ2awpqfha74plLyIRviB7FnsfkaY4ZaQPp84CPI"}'::jsonb,
    body := jsonb_build_object(
      'triggerType', 'new_lead',
      'recipientEmail', NEW.email,
      'recipientName', NEW.first_name || ' ' || NEW.last_name,
      'businessName', NEW.business_name
    )
  );
  
  RETURN NEW;
END;
$function$;

-- Create trigger for new leads (fires AFTER the welcome sequence trigger)
DROP TRIGGER IF EXISTS on_new_lead_created ON contact_submissions;
CREATE TRIGGER on_new_lead_created
  AFTER INSERT ON contact_submissions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_new_lead_sequence();

-- Create trigger function for hot_lead sequence (when stage changes to Hot Lead)
CREATE OR REPLACE FUNCTION public.trigger_hot_lead_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  hot_lead_stage_id UUID;
BEGIN
  -- Get the Hot Lead stage ID
  SELECT id INTO hot_lead_stage_id FROM pipeline_stages WHERE name = 'Hot Lead' LIMIT 1;
  
  -- Only trigger if moving TO the Hot Lead stage (not from it)
  IF NEW.pipeline_stage_id = hot_lead_stage_id 
     AND (OLD.pipeline_stage_id IS NULL OR OLD.pipeline_stage_id != hot_lead_stage_id) THEN
    
    PERFORM net.http_post(
      url := 'https://dnwbdnwbwwoxiswzzikg.supabase.co/functions/v1/queue-sequence-emails',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRud2Jkbndid3dveGlzd3p6aWtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MDA1MTQsImV4cCI6MjA4MDI3NjUxNH0.amvnQ2awpqfha74plLyIRviB7FnsfkaY4ZaQPp84CPI"}'::jsonb,
      body := jsonb_build_object(
        'triggerType', 'hot_lead',
        'recipientEmail', NEW.email,
        'recipientName', NEW.first_name || ' ' || NEW.last_name,
        'businessName', NEW.business_name
      )
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger for hot lead stage changes
DROP TRIGGER IF EXISTS on_hot_lead_stage ON contact_submissions;
CREATE TRIGGER on_hot_lead_stage
  AFTER UPDATE OF pipeline_stage_id ON contact_submissions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_hot_lead_sequence();

-- Update last_activity_at when contact is updated
CREATE OR REPLACE FUNCTION public.update_contact_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.last_activity_at = now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_contact_activity ON contact_submissions;
CREATE TRIGGER on_contact_activity
  BEFORE UPDATE ON contact_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_contact_activity();