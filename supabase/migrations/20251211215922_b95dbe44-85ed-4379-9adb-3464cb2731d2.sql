-- Create personalization_rules table for website personalization
CREATE TABLE public.personalization_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  segment TEXT NOT NULL CHECK (segment IN ('new_visitor', 'returning_visitor', 'local_user', 'out_of_town', 'past_buyer', 'engaged_scroller')),
  component_type TEXT NOT NULL CHECK (component_type IN ('headline', 'cta', 'banner', 'offer')),
  original_content TEXT NOT NULL,
  personalized_content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 1,
  conditions JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create qa_reports table for AI-Driven Quality Assurance
CREATE TABLE public.qa_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  page_title TEXT,
  broken_links JSONB DEFAULT '[]'::jsonb,
  spelling_errors JSONB DEFAULT '[]'::jsonb,
  missing_metadata JSONB DEFAULT '[]'::jsonb,
  mobile_issues JSONB DEFAULT '[]'::jsonb,
  accessibility_issues JSONB DEFAULT '[]'::jsonb,
  load_time_ms INTEGER,
  overall_score INTEGER,
  auto_fixes_applied JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create before_after_showcases table
CREATE TABLE public.before_after_showcases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  project_type TEXT NOT NULL DEFAULT 'website_redesign',
  before_screenshot_url TEXT,
  after_screenshot_url TEXT,
  before_mobile_url TEXT,
  after_mobile_url TEXT,
  before_stats JSONB DEFAULT '{}'::jsonb,
  after_stats JSONB DEFAULT '{}'::jsonb,
  improvements JSONB DEFAULT '[]'::jsonb,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sales_proposals table
CREATE TABLE public.sales_proposals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_submission_id UUID REFERENCES public.contact_submissions(id) ON DELETE SET NULL,
  prospect_name TEXT NOT NULL,
  prospect_email TEXT NOT NULL,
  prospect_business TEXT NOT NULL,
  prospect_industry TEXT,
  industry_analysis JSONB DEFAULT '{}'::jsonb,
  proposed_services JSONB DEFAULT '[]'::jsonb,
  sample_designs JSONB DEFAULT '[]'::jsonb,
  roi_projections JSONB DEFAULT '{}'::jsonb,
  timeline JSONB DEFAULT '[]'::jsonb,
  pricing_breakdown JSONB DEFAULT '[]'::jsonb,
  total_investment NUMERIC,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'declined')),
  sent_at TIMESTAMP WITH TIME ZONE,
  viewed_at TIMESTAMP WITH TIME ZONE,
  responded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.personalization_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.before_after_showcases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_proposals ENABLE ROW LEVEL SECURITY;

-- RLS policies for personalization_rules
CREATE POLICY "Admins can manage personalization rules" 
ON public.personalization_rules 
FOR ALL 
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- RLS policies for qa_reports
CREATE POLICY "Admins can manage QA reports" 
ON public.qa_reports 
FOR ALL 
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Clients can view their QA reports" 
ON public.qa_reports 
FOR SELECT 
USING (client_account_id IN (
  SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
));

-- RLS policies for before_after_showcases
CREATE POLICY "Admins can manage showcases" 
ON public.before_after_showcases 
FOR ALL 
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Public showcases are viewable by all" 
ON public.before_after_showcases 
FOR SELECT 
USING (is_public = true);

CREATE POLICY "Clients can view their showcases" 
ON public.before_after_showcases 
FOR SELECT 
USING (client_account_id IN (
  SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
));

-- RLS policies for sales_proposals
CREATE POLICY "Admins can manage sales proposals" 
ON public.sales_proposals 
FOR ALL 
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Create triggers for updated_at
CREATE TRIGGER update_personalization_rules_updated_at
  BEFORE UPDATE ON public.personalization_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_qa_reports_updated_at
  BEFORE UPDATE ON public.qa_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_before_after_showcases_updated_at
  BEFORE UPDATE ON public.before_after_showcases
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sales_proposals_updated_at
  BEFORE UPDATE ON public.sales_proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();