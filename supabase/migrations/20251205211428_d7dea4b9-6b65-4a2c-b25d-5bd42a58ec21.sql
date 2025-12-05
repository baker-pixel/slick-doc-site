-- Create automation_alerts table for failure notifications
CREATE TABLE public.automation_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  source TEXT,
  source_id UUID,
  metadata JSONB,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  acknowledged_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.automation_alerts ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access to automation_alerts"
ON public.automation_alerts
FOR ALL
USING (true)
WITH CHECK (true);

-- Create pipeline_stages table for tracking funnel stages
CREATE TABLE public.pipeline_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  stage_order INTEGER NOT NULL,
  color TEXT DEFAULT '#3B82F6',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access to pipeline_stages"
ON public.pipeline_stages
FOR ALL
USING (true)
WITH CHECK (true);

-- Insert default pipeline stages
INSERT INTO public.pipeline_stages (name, description, stage_order, color) VALUES
('New Lead', 'Fresh lead from form submission', 1, '#6B7280'),
('Welcome Sequence', 'Enrolled in welcome email sequence', 2, '#3B82F6'),
('Engaged', 'Opened/clicked emails', 3, '#8B5CF6'),
('Qualified', 'Completed gap analysis or booked call', 4, '#F59E0B'),
('Customer', 'Converted to paying customer', 5, '#10B981');

-- Add pipeline_stage_id to contact_submissions
ALTER TABLE public.contact_submissions 
ADD COLUMN IF NOT EXISTS pipeline_stage_id UUID REFERENCES public.pipeline_stages(id);

-- Set default stage for new leads
UPDATE public.contact_submissions 
SET pipeline_stage_id = (SELECT id FROM public.pipeline_stages WHERE stage_order = 1)
WHERE pipeline_stage_id IS NULL;

-- Create function to auto-trigger sequences on form submission
CREATE OR REPLACE FUNCTION public.trigger_welcome_sequence()
RETURNS TRIGGER AS $$
BEGIN
  -- Call the queue-sequence-emails edge function via pg_net
  PERFORM net.http_post(
    url := 'https://dnwbdnwbwwoxiswzzikg.supabase.co/functions/v1/queue-sequence-emails',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRud2Jkbndid3dveGlzd3p6aWtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MDA1MTQsImV4cCI6MjA4MDI3NjUxNH0.amvnQ2awpqfha74plLyIRviB7FnsfkaY4ZaQPp84CPI"}'::jsonb,
    body := jsonb_build_object(
      'triggerType', 'contact_form',
      'recipientEmail', NEW.email,
      'recipientName', NEW.first_name || ' ' || NEW.last_name,
      'businessName', NEW.business_name
    )
  );
  
  -- Set pipeline stage to "Welcome Sequence"
  NEW.pipeline_stage_id := (SELECT id FROM public.pipeline_stages WHERE stage_order = 2);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for contact form submissions
CREATE TRIGGER on_contact_submission_trigger_sequence
  BEFORE INSERT ON public.contact_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_welcome_sequence();

-- Create trigger for gap analysis submissions
CREATE OR REPLACE FUNCTION public.trigger_gap_analysis_sequence()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger on new submissions (not updates)
  IF TG_OP = 'INSERT' THEN
    PERFORM net.http_post(
      url := 'https://dnwbdnwbwwoxiswzzikg.supabase.co/functions/v1/queue-sequence-emails',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRud2Jkbndid3dveGlzd3p6aWtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MDA1MTQsImV4cCI6MjA4MDI3NjUxNH0.amvnQ2awpqfha74plLyIRviB7FnsfkaY4ZaQPp84CPI"}'::jsonb,
      body := jsonb_build_object(
        'triggerType', 'gap_analysis',
        'recipientEmail', NEW.email,
        'recipientName', NEW.first_name || ' ' || NEW.last_name,
        'businessName', NEW.business_name
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_gap_analysis_trigger_sequence
  AFTER INSERT ON public.gap_analysis_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_gap_analysis_sequence();

-- Create trigger for PDF leads
CREATE OR REPLACE FUNCTION public.trigger_pdf_lead_sequence()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://dnwbdnwbwwoxiswzzikg.supabase.co/functions/v1/queue-sequence-emails',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRud2Jkbndid3dveGlzd3p6aWtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MDA1MTQsImV4cCI6MjA4MDI3NjUxNH0.amvnQ2awpqfha74plLyIRviB7FnsfkaY4ZaQPp84CPI"}'::jsonb,
    body := jsonb_build_object(
      'triggerType', 'pdf_download',
      'recipientEmail', NEW.email,
      'recipientName', COALESCE(NEW.first_name, 'there')
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_pdf_lead_trigger_sequence
  AFTER INSERT ON public.pdf_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_pdf_lead_sequence();