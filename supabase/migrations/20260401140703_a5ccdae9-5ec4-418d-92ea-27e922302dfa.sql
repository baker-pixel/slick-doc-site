-- Add client_account_id to content_calendar
ALTER TABLE public.content_calendar 
ADD COLUMN client_account_id UUID REFERENCES public.client_accounts(id) ON DELETE SET NULL;

-- Index for filtering by client
CREATE INDEX idx_content_calendar_client ON public.content_calendar(client_account_id);
