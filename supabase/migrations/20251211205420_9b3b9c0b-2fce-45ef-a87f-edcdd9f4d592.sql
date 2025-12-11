-- Create SEO page analysis table
CREATE TABLE public.seo_page_analysis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  page_title TEXT,
  
  -- Scores (0-100)
  overall_score INTEGER,
  readability_score INTEGER,
  keyword_score INTEGER,
  technical_score INTEGER,
  backlink_potential INTEGER,
  
  -- Analysis data
  keywords_found JSONB DEFAULT '[]'::jsonb,
  technical_issues JSONB DEFAULT '[]'::jsonb,
  readability_issues JSONB DEFAULT '[]'::jsonb,
  suggestions JSONB DEFAULT '[]'::jsonb,
  ai_rewrites JSONB DEFAULT '[]'::jsonb,
  
  -- Meta
  meta_title TEXT,
  meta_description TEXT,
  h1_tags JSONB DEFAULT '[]'::jsonb,
  word_count INTEGER,
  image_count INTEGER,
  images_missing_alt INTEGER DEFAULT 0,
  internal_links INTEGER DEFAULT 0,
  external_links INTEGER DEFAULT 0,
  broken_links JSONB DEFAULT '[]'::jsonb,
  
  -- Performance
  load_time_ms INTEGER,
  mobile_friendly BOOLEAN DEFAULT true,
  
  analyzed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.seo_page_analysis ENABLE ROW LEVEL SECURITY;

-- Admin can manage all
CREATE POLICY "Admins can manage SEO analysis"
ON public.seo_page_analysis
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Clients can view their analysis
CREATE POLICY "Clients can view their SEO analysis"
ON public.seo_page_analysis
FOR SELECT
USING (client_account_id IN (
  SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
));

-- Service role full access
CREATE POLICY "Service role full access SEO analysis"
ON public.seo_page_analysis
FOR ALL
USING (true);

-- Index for fast lookups
CREATE INDEX idx_seo_page_analysis_client ON public.seo_page_analysis(client_account_id);
CREATE INDEX idx_seo_page_analysis_url ON public.seo_page_analysis(url);

-- Add trigger for updated_at
CREATE TRIGGER update_seo_page_analysis_updated_at
BEFORE UPDATE ON public.seo_page_analysis
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();