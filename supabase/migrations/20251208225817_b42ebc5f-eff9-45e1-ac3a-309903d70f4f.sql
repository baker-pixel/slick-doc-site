-- Create activity_feed table to track all client portal activities
CREATE TABLE public.activity_feed (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  icon TEXT DEFAULT 'activity',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_activity_feed_client_account_id ON public.activity_feed(client_account_id);
CREATE INDEX idx_activity_feed_created_at ON public.activity_feed(created_at DESC);

-- Enable RLS
ALTER TABLE public.activity_feed ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage all activities"
  ON public.activity_feed
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their activities"
  ON public.activity_feed
  FOR SELECT
  USING (client_account_id IN (
    SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
  ));

-- Function to log activity
CREATE OR REPLACE FUNCTION public.log_client_activity(
  p_client_account_id UUID,
  p_activity_type TEXT,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_icon TEXT DEFAULT 'activity'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activity_id UUID;
BEGIN
  INSERT INTO public.activity_feed (client_account_id, activity_type, title, description, metadata, icon)
  VALUES (p_client_account_id, p_activity_type, p_title, p_description, p_metadata, p_icon)
  RETURNING id INTO v_activity_id;
  
  RETURN v_activity_id;
END;
$$;