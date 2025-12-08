-- Create client requests/tasks table
CREATE TABLE public.client_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  request_type TEXT NOT NULL DEFAULT 'general',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'pending',
  attachments JSONB DEFAULT '[]'::jsonb,
  admin_notes TEXT,
  submitted_by TEXT,
  assigned_to TEXT,
  due_date DATE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_requests ENABLE ROW LEVEL SECURITY;

-- Clients can view their own requests
CREATE POLICY "Clients can view their requests"
ON public.client_requests
FOR SELECT
USING (client_account_id IN (
  SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
));

-- Clients can submit new requests
CREATE POLICY "Clients can submit requests"
ON public.client_requests
FOR INSERT
WITH CHECK (client_account_id IN (
  SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
));

-- Clients can update their pending requests
CREATE POLICY "Clients can update pending requests"
ON public.client_requests
FOR UPDATE
USING (
  client_account_id IN (
    SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
  )
  AND status = 'pending'
);

-- Admins can manage all requests
CREATE POLICY "Admins can manage all requests"
ON public.client_requests
FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Add trigger for updated_at
CREATE TRIGGER update_client_requests_updated_at
BEFORE UPDATE ON public.client_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_requests;