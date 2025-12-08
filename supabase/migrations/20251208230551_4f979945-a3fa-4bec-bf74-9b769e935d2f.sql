-- Create deliverables table
CREATE TABLE public.deliverables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.client_projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  file_url TEXT,
  file_name TEXT,
  preview_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review',
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,
  revision_notes TEXT,
  revision_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_deliverables_client ON public.deliverables(client_account_id);
CREATE INDEX idx_deliverables_status ON public.deliverables(status);
CREATE INDEX idx_deliverables_project ON public.deliverables(project_id);

-- Enable RLS
ALTER TABLE public.deliverables ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage all deliverables"
  ON public.deliverables
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their deliverables"
  ON public.deliverables
  FOR SELECT
  USING (client_account_id IN (
    SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Clients can update their deliverables for review"
  ON public.deliverables
  FOR UPDATE
  USING (client_account_id IN (
    SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
  ));

-- Updated_at trigger
CREATE TRIGGER update_deliverables_updated_at
  BEFORE UPDATE ON public.deliverables
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for deliverable files
INSERT INTO storage.buckets (id, name, public) VALUES ('deliverables', 'deliverables', false);

-- Storage policies
CREATE POLICY "Clients can view their deliverable files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'deliverables' AND 
    (storage.foldername(name))[1] IN (
      SELECT client_account_id::text FROM client_portal_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage deliverable files"
  ON storage.objects FOR ALL
  USING (bucket_id = 'deliverables' AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'deliverables' AND has_role(auth.uid(), 'admin'::app_role));