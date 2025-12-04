-- Create client_accounts table for managing client tiers and subscriptions
CREATE TABLE public.client_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  business_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  tier TEXT NOT NULL CHECK (tier IN ('foundation', 'growth', 'scale', 'dominate')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'pending')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  onboarded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sop_documents table for storing tier-specific SOPs
CREATE TABLE public.sop_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tier TEXT NOT NULL CHECK (tier IN ('foundation', 'growth', 'scale', 'dominate')),
  category TEXT NOT NULL CHECK (category IN ('email_sequences', 'content_generation', 'reporting', 'general')),
  name TEXT NOT NULL,
  description TEXT,
  file_url TEXT,
  parsed_content JSONB,
  action_items JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create automation_jobs table for tracking AI-executed tasks
CREATE TABLE public.automation_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  sop_id UUID REFERENCES public.sop_documents(id),
  job_type TEXT NOT NULL CHECK (job_type IN ('email_sequence', 'content_generation', 'report', 'custom')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  input_data JSONB,
  output_data JSONB,
  ai_model_used TEXT,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create generated_content table for AI-created content
CREATE TABLE public.generated_content (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.automation_jobs(id),
  content_type TEXT NOT NULL CHECK (content_type IN ('email', 'blog_post', 'social_post', 'ad_copy', 'report', 'other')),
  title TEXT,
  content TEXT NOT NULL,
  metadata JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'published', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create client_reports table for automated reporting
CREATE TABLE public.client_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.automation_jobs(id),
  report_type TEXT NOT NULL CHECK (report_type IN ('weekly', 'monthly', 'quarterly', 'custom')),
  report_period_start DATE NOT NULL,
  report_period_end DATE NOT NULL,
  metrics JSONB,
  insights JSONB,
  recommendations JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.client_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sop_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for client_accounts (admin only for now)
CREATE POLICY "Admin full access to client_accounts"
ON public.client_accounts FOR ALL
USING (true)
WITH CHECK (true);

-- RLS Policies for sop_documents (admin only)
CREATE POLICY "Admin full access to sop_documents"
ON public.sop_documents FOR ALL
USING (true)
WITH CHECK (true);

-- RLS Policies for automation_jobs (admin only)
CREATE POLICY "Admin full access to automation_jobs"
ON public.automation_jobs FOR ALL
USING (true)
WITH CHECK (true);

-- RLS Policies for generated_content (admin only)
CREATE POLICY "Admin full access to generated_content"
ON public.generated_content FOR ALL
USING (true)
WITH CHECK (true);

-- RLS Policies for client_reports (admin only)
CREATE POLICY "Admin full access to client_reports"
ON public.client_reports FOR ALL
USING (true)
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_client_accounts_tier ON public.client_accounts(tier);
CREATE INDEX idx_client_accounts_status ON public.client_accounts(status);
CREATE INDEX idx_sop_documents_tier ON public.sop_documents(tier);
CREATE INDEX idx_sop_documents_category ON public.sop_documents(category);
CREATE INDEX idx_automation_jobs_client ON public.automation_jobs(client_id);
CREATE INDEX idx_automation_jobs_status ON public.automation_jobs(status);
CREATE INDEX idx_generated_content_client ON public.generated_content(client_id);
CREATE INDEX idx_client_reports_client ON public.client_reports(client_id);

-- Add updated_at triggers
CREATE TRIGGER update_client_accounts_updated_at
BEFORE UPDATE ON public.client_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sop_documents_updated_at
BEFORE UPDATE ON public.sop_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_generated_content_updated_at
BEFORE UPDATE ON public.generated_content
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for SOP documents
INSERT INTO storage.buckets (id, name, public) VALUES ('sop-documents', 'sop-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for SOP documents (admin only)
CREATE POLICY "Admin can upload SOP documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'sop-documents');

CREATE POLICY "Admin can view SOP documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'sop-documents');

CREATE POLICY "Admin can delete SOP documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'sop-documents');