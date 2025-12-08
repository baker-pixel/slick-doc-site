-- Create client_messages table for communication
CREATE TABLE public.client_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('client', 'agency')),
  sender_name TEXT,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_messages ENABLE ROW LEVEL SECURITY;

-- Clients can view messages for their account
CREATE POLICY "Clients can view their messages"
ON public.client_messages
FOR SELECT
USING (
  client_account_id IN (
    SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
  )
);

-- Clients can insert messages (as client type)
CREATE POLICY "Clients can send messages"
ON public.client_messages
FOR INSERT
WITH CHECK (
  sender_type = 'client' AND
  client_account_id IN (
    SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
  )
);

-- Clients can update read status on agency messages
CREATE POLICY "Clients can mark messages as read"
ON public.client_messages
FOR UPDATE
USING (
  client_account_id IN (
    SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
  )
);

-- Admins can manage all messages
CREATE POLICY "Admins can manage all messages"
ON public.client_messages
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_messages;

-- Create index for faster lookups
CREATE INDEX idx_client_messages_account_id ON public.client_messages(client_account_id);
CREATE INDEX idx_client_messages_created_at ON public.client_messages(created_at DESC);