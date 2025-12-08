-- Create client_documents table
CREATE TABLE public.client_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  description TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;

-- Clients can view their own documents
CREATE POLICY "Clients can view their documents"
ON public.client_documents
FOR SELECT
USING (
  client_account_id IN (
    SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
  )
);

-- Admins can manage all documents
CREATE POLICY "Admins can manage all documents"
ON public.client_documents
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create storage bucket for client documents
INSERT INTO storage.buckets (id, name, public) VALUES ('client-documents', 'client-documents', false);

-- Storage policies for client documents bucket
CREATE POLICY "Clients can view their documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'client-documents' AND
  (storage.foldername(name))[1] IN (
    SELECT client_account_id::text FROM client_portal_users WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage all client documents"
ON storage.objects FOR ALL
USING (bucket_id = 'client-documents' AND has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'client-documents' AND has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime for client_documents
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_documents;

-- Trigger for updated_at
CREATE TRIGGER update_client_documents_updated_at
BEFORE UPDATE ON public.client_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();