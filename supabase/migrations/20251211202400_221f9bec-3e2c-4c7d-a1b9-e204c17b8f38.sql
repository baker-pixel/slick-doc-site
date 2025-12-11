-- Task Templates: Master checklist imported from your sheet
CREATE TABLE public.task_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  instructions TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  tier TEXT NOT NULL, -- foundation, growth, scale, dominate
  automation_type TEXT NOT NULL DEFAULT 'MANUAL', -- FULL, SEMI, MANUAL
  frequency TEXT, -- onboarding, weekly, monthly, quarterly, as_needed
  estimated_minutes INTEGER,
  order_index INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Client Tasks: Specific tasks for each client
CREATE TABLE public.client_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  task_template_id UUID REFERENCES public.task_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  instructions TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  automation_type TEXT NOT NULL DEFAULT 'MANUAL',
  status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, cancelled
  assigned_to TEXT,
  due_date DATE,
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by TEXT,
  notes TEXT,
  output_data JSONB,
  automation_job_id UUID REFERENCES public.automation_jobs(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Integration Configs: Store API keys/settings for GHL, GA4, etc.
CREATE TABLE public.integration_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_type TEXT NOT NULL, -- gohighlevel, google_analytics, google_ads, facebook_ads, resend, etc.
  name TEXT NOT NULL,
  api_key_encrypted TEXT, -- Stored encrypted or use secrets
  settings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Client Integrations: Link clients to specific integrations
CREATE TABLE public.client_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  integration_config_id UUID NOT NULL REFERENCES public.integration_configs(id) ON DELETE CASCADE,
  external_id TEXT, -- e.g., GHL contact ID, GA4 property ID
  settings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_account_id, integration_config_id)
);

-- Add Google Place ID to client_accounts for review system
ALTER TABLE public.client_accounts 
ADD COLUMN IF NOT EXISTS google_place_id TEXT,
ADD COLUMN IF NOT EXISTS google_review_url TEXT,
ADD COLUMN IF NOT EXISTS review_qr_image_url TEXT,
ADD COLUMN IF NOT EXISTS industry TEXT,
ADD COLUMN IF NOT EXISTS intake_completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS kickoff_scheduled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;

-- KPI Dashboards
CREATE TABLE public.kpi_dashboards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  config JSONB NOT NULL DEFAULT '{"widgets": []}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_account_id)
);

-- Reporting Schedules
CREATE TABLE public.reporting_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL DEFAULT 'performance', -- performance, seo, ads, custom
  frequency TEXT NOT NULL DEFAULT 'monthly', -- daily, weekly, monthly
  recipients TEXT[] NOT NULL DEFAULT '{}',
  next_run_at TIMESTAMP WITH TIME ZONE,
  last_run_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- SEO Audits
CREATE TABLE public.seo_audits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  audit_type TEXT NOT NULL DEFAULT 'full', -- full, technical, content, local
  results JSONB NOT NULL DEFAULT '{}',
  score INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Page Speed Results
CREATE TABLE public.page_speed_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  score_mobile INTEGER,
  score_desktop INTEGER,
  core_web_vitals JSONB,
  raw_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Keyword Gap Analysis
CREATE TABLE public.keyword_gap_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  competitors TEXT[],
  results JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Client Competitors
CREATE TABLE public.client_competitors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- SEO Suggestions (quarterly)
CREATE TABLE public.seo_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  suggestions JSONB NOT NULL DEFAULT '[]',
  period TEXT, -- Q1 2025, Q2 2025, etc.
  status TEXT DEFAULT 'pending', -- pending, reviewed, implemented
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Client Onboarding Progress
CREATE TABLE public.client_onboarding (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  intake_form_sent_at TIMESTAMP WITH TIME ZONE,
  intake_form_completed_at TIMESTAMP WITH TIME ZONE,
  crm_added_at TIMESTAMP WITH TIME ZONE,
  kickoff_scheduled_at TIMESTAMP WITH TIME ZONE,
  kickoff_completed_at TIMESTAMP WITH TIME ZONE,
  review_system_setup_at TIMESTAMP WITH TIME ZONE,
  dashboard_created_at TIMESTAMP WITH TIME ZONE,
  onboarding_completed_at TIMESTAMP WITH TIME ZONE,
  current_step INTEGER DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_account_id)
);

-- Enable RLS on all new tables
ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reporting_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_speed_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keyword_gap_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_onboarding ENABLE ROW LEVEL SECURITY;

-- Admin policies for all tables
CREATE POLICY "Admins can manage task_templates" ON public.task_templates FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage client_tasks" ON public.client_tasks FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage integration_configs" ON public.integration_configs FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage client_integrations" ON public.client_integrations FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage kpi_dashboards" ON public.kpi_dashboards FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage reporting_schedules" ON public.reporting_schedules FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage seo_audits" ON public.seo_audits FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage page_speed_results" ON public.page_speed_results FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage keyword_gap_results" ON public.keyword_gap_results FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage client_competitors" ON public.client_competitors FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage seo_suggestions" ON public.seo_suggestions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage client_onboarding" ON public.client_onboarding FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Client view policies
CREATE POLICY "Clients can view their tasks" ON public.client_tasks FOR SELECT 
USING (client_account_id IN (SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()));

CREATE POLICY "Clients can view their dashboards" ON public.kpi_dashboards FOR SELECT 
USING (client_account_id IN (SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()));

CREATE POLICY "Clients can view their seo_audits" ON public.seo_audits FOR SELECT 
USING (client_account_id IN (SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()));

CREATE POLICY "Clients can view their page_speed_results" ON public.page_speed_results FOR SELECT 
USING (client_account_id IN (SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()));

-- Service role policies for edge functions
CREATE POLICY "Service role full access task_templates" ON public.task_templates FOR ALL USING (true);
CREATE POLICY "Service role full access client_tasks" ON public.client_tasks FOR ALL USING (true);
CREATE POLICY "Service role full access integration_configs" ON public.integration_configs FOR ALL USING (true);
CREATE POLICY "Service role full access client_integrations" ON public.client_integrations FOR ALL USING (true);
CREATE POLICY "Service role full access kpi_dashboards" ON public.kpi_dashboards FOR ALL USING (true);
CREATE POLICY "Service role full access reporting_schedules" ON public.reporting_schedules FOR ALL USING (true);
CREATE POLICY "Service role full access seo_audits" ON public.seo_audits FOR ALL USING (true);
CREATE POLICY "Service role full access page_speed_results" ON public.page_speed_results FOR ALL USING (true);
CREATE POLICY "Service role full access keyword_gap_results" ON public.keyword_gap_results FOR ALL USING (true);
CREATE POLICY "Service role full access client_competitors" ON public.client_competitors FOR ALL USING (true);
CREATE POLICY "Service role full access seo_suggestions" ON public.seo_suggestions FOR ALL USING (true);
CREATE POLICY "Service role full access client_onboarding" ON public.client_onboarding FOR ALL USING (true);

-- Function to generate client tasks from templates when client is created
CREATE OR REPLACE FUNCTION public.generate_tasks_for_client(p_client_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client RECORD;
  v_template RECORD;
  v_count INTEGER := 0;
BEGIN
  -- Get client info
  SELECT * INTO v_client FROM client_accounts WHERE id = p_client_id;
  
  IF v_client IS NULL THEN
    RAISE EXCEPTION 'Client not found';
  END IF;
  
  -- Generate tasks from templates matching client's tier
  FOR v_template IN 
    SELECT * FROM task_templates 
    WHERE tier = v_client.tier 
    AND is_active = true
    ORDER BY order_index
  LOOP
    INSERT INTO client_tasks (
      client_account_id,
      task_template_id,
      name,
      description,
      instructions,
      category,
      automation_type,
      status
    ) VALUES (
      p_client_id,
      v_template.id,
      v_template.name,
      v_template.description,
      v_template.instructions,
      v_template.category,
      v_template.automation_type,
      'pending'
    );
    v_count := v_count + 1;
  END LOOP;
  
  -- Create onboarding record
  INSERT INTO client_onboarding (client_account_id)
  VALUES (p_client_id)
  ON CONFLICT (client_account_id) DO NOTHING;
  
  -- Create KPI dashboard
  INSERT INTO kpi_dashboards (client_account_id, config)
  VALUES (
    p_client_id,
    CASE v_client.tier
      WHEN 'foundation' THEN '{"widgets": ["traffic_overview", "gbp_calls", "form_submissions", "reviews"]}'::jsonb
      WHEN 'growth' THEN '{"widgets": ["traffic_overview", "gbp_calls", "form_submissions", "reviews", "lead_sources", "email_performance", "ad_performance"]}'::jsonb
      WHEN 'scale' THEN '{"widgets": ["traffic_overview", "gbp_calls", "form_submissions", "reviews", "lead_sources", "email_performance", "ad_performance", "funnel_metrics", "seo_visibility", "retention"]}'::jsonb
      ELSE '{"widgets": ["traffic_overview", "gbp_calls", "form_submissions", "reviews", "lead_sources", "email_performance", "ad_performance", "funnel_metrics", "seo_visibility", "retention", "revenue_attribution"]}'::jsonb
    END
  )
  ON CONFLICT (client_account_id) DO NOTHING;
  
  -- Create reporting schedule
  INSERT INTO reporting_schedules (client_account_id, report_type, frequency, recipients)
  VALUES (
    p_client_id,
    'performance',
    CASE v_client.tier
      WHEN 'foundation' THEN 'monthly'
      WHEN 'growth' THEN 'monthly'
      ELSE 'weekly'
    END,
    ARRAY[v_client.email]
  );
  
  RETURN v_count;
END;
$$;

-- Trigger to auto-generate tasks when a new client is created
CREATE OR REPLACE FUNCTION public.trigger_generate_client_tasks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM generate_tasks_for_client(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_client_created_generate_tasks
  AFTER INSERT ON public.client_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_generate_client_tasks();

-- Add updated_at triggers
CREATE TRIGGER update_task_templates_updated_at BEFORE UPDATE ON public.task_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_client_tasks_updated_at BEFORE UPDATE ON public.client_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_integration_configs_updated_at BEFORE UPDATE ON public.integration_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_client_integrations_updated_at BEFORE UPDATE ON public.client_integrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_kpi_dashboards_updated_at BEFORE UPDATE ON public.kpi_dashboards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_reporting_schedules_updated_at BEFORE UPDATE ON public.reporting_schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_client_onboarding_updated_at BEFORE UPDATE ON public.client_onboarding FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();