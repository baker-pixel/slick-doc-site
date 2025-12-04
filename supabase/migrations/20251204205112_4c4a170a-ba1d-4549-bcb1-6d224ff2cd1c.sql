-- Create email tracking events table
CREATE TABLE public.email_tracking_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email_log_id UUID REFERENCES public.email_logs(id),
  event_type TEXT NOT NULL, -- 'open', 'click', 'delivered', 'bounced', 'complained'
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT,
  link_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_tracking_events ENABLE ROW LEVEL SECURITY;

-- Service role can manage tracking events
CREATE POLICY "Service role can manage email_tracking_events"
ON public.email_tracking_events
FOR ALL
USING (true);

-- Add tracking_id to email_logs for pixel tracking
ALTER TABLE public.email_logs ADD COLUMN tracking_id UUID DEFAULT gen_random_uuid();

-- Create index for faster lookups
CREATE INDEX idx_email_tracking_events_email_log_id ON public.email_tracking_events(email_log_id);
CREATE INDEX idx_email_logs_tracking_id ON public.email_logs(tracking_id);