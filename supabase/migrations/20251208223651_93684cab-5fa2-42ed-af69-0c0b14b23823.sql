-- Create client_meetings table
CREATE TABLE public.client_meetings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  meeting_type TEXT NOT NULL DEFAULT 'call',
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'rescheduled')),
  meeting_link TEXT,
  notes TEXT,
  booked_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_meetings ENABLE ROW LEVEL SECURITY;

-- Clients can view their meetings
CREATE POLICY "Clients can view their meetings"
ON public.client_meetings
FOR SELECT
USING (
  client_account_id IN (
    SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
  )
);

-- Clients can insert meetings (book new meetings)
CREATE POLICY "Clients can book meetings"
ON public.client_meetings
FOR INSERT
WITH CHECK (
  client_account_id IN (
    SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
  )
);

-- Clients can update their own meetings (cancel/reschedule)
CREATE POLICY "Clients can update their meetings"
ON public.client_meetings
FOR UPDATE
USING (
  client_account_id IN (
    SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
  )
);

-- Admins can manage all meetings
CREATE POLICY "Admins can manage all meetings"
ON public.client_meetings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_meetings;

-- Add trigger for updated_at
CREATE TRIGGER update_client_meetings_updated_at
BEFORE UPDATE ON public.client_meetings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_client_meetings_account_id ON public.client_meetings(client_account_id);
CREATE INDEX idx_client_meetings_scheduled_at ON public.client_meetings(scheduled_at);