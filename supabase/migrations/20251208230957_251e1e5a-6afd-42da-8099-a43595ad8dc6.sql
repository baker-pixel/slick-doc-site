-- Create service_agreements table
CREATE TABLE public.service_agreements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  agreement_type TEXT NOT NULL DEFAULT 'contract',
  file_url TEXT,
  file_name TEXT,
  file_size INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  effective_date DATE,
  expiration_date DATE,
  signed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.service_agreements ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage all agreements"
ON public.service_agreements
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their agreements"
ON public.service_agreements
FOR SELECT
USING (client_account_id IN (
  SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
));

-- Create trigger for updated_at
CREATE TRIGGER update_service_agreements_updated_at
BEFORE UPDATE ON public.service_agreements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for agreements
INSERT INTO storage.buckets (id, name, public) VALUES ('service-agreements', 'service-agreements', false);

-- Storage policies for agreements
CREATE POLICY "Admins can manage all agreement files"
ON storage.objects
FOR ALL
USING (bucket_id = 'service-agreements' AND has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'service-agreements' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their agreement files"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'service-agreements' AND 
  (storage.foldername(name))[1] IN (
    SELECT client_account_id::text FROM client_portal_users WHERE user_id = auth.uid()
  )
);