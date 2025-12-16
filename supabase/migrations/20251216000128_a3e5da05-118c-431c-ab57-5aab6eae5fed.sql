-- Create table for saved ad campaigns
CREATE TABLE public.ad_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID REFERENCES public.client_accounts(id),
  name TEXT NOT NULL,
  goal TEXT NOT NULL,
  location TEXT NOT NULL,
  industry TEXT NOT NULL,
  budget TEXT,
  platform TEXT NOT NULL DEFAULT 'both',
  additional_info TEXT,
  competitor_urls TEXT[],
  generated_ads JSONB NOT NULL DEFAULT '[]'::jsonb,
  ab_variants JSONB DEFAULT '[]'::jsonb,
  performance_predictions JSONB,
  budget_recommendations JSONB,
  landing_page_html TEXT,
  generated_images JSONB DEFAULT '[]'::jsonb,
  scheduled_start_date DATE,
  scheduled_end_date DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for ad campaign analytics
CREATE TABLE public.ad_campaign_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ad_campaign_id UUID NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  spend DECIMAL(10,2) DEFAULT 0,
  ctr DECIMAL(5,4),
  cpc DECIMAL(10,2),
  cpa DECIMAL(10,2),
  roas DECIMAL(10,2),
  recorded_date DATE NOT NULL,
  platform TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for ad format templates
CREATE TABLE public.ad_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  platform TEXT NOT NULL,
  ad_type TEXT NOT NULL,
  template_config JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaign_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_templates ENABLE ROW LEVEL SECURITY;

-- Policies for ad_campaigns (admins can do everything)
CREATE POLICY "Admins can manage ad campaigns" ON public.ad_campaigns
  FOR ALL USING (true) WITH CHECK (true);

-- Policies for ad_campaign_analytics
CREATE POLICY "Admins can manage ad campaign analytics" ON public.ad_campaign_analytics
  FOR ALL USING (true) WITH CHECK (true);

-- Policies for ad_templates
CREATE POLICY "Admins can manage ad templates" ON public.ad_templates
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can view active templates" ON public.ad_templates
  FOR SELECT USING (is_active = true);

-- Create indexes
CREATE INDEX idx_ad_campaigns_client ON public.ad_campaigns(client_account_id);
CREATE INDEX idx_ad_campaigns_status ON public.ad_campaigns(status);
CREATE INDEX idx_ad_campaign_analytics_campaign ON public.ad_campaign_analytics(ad_campaign_id);
CREATE INDEX idx_ad_campaign_analytics_date ON public.ad_campaign_analytics(recorded_date);

-- Create updated_at triggers
CREATE TRIGGER update_ad_campaigns_updated_at
  BEFORE UPDATE ON public.ad_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ad_templates_updated_at
  BEFORE UPDATE ON public.ad_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default ad templates
INSERT INTO public.ad_templates (name, description, platform, ad_type, template_config) VALUES
('Responsive Search Ad', 'Standard Google responsive search ad format', 'google', 'search', '{"maxHeadlines": 15, "maxDescriptions": 4, "headlineCharLimit": 30, "descriptionCharLimit": 90}'::jsonb),
('Performance Max', 'Google Performance Max campaign format', 'google', 'performance_max', '{"assetGroups": true, "audiences": true, "signals": true}'::jsonb),
('Local Services', 'Google Local Services Ad format', 'google', 'local', '{"businessType": true, "serviceAreas": true, "badges": true}'::jsonb),
('Image Ad', 'Single image ad for Meta feeds', 'meta', 'image', '{"aspectRatios": ["1:1", "4:5", "16:9"], "textOverlay": true}'::jsonb),
('Carousel Ad', 'Multi-image carousel for Meta', 'meta', 'carousel', '{"minCards": 2, "maxCards": 10, "cardCharLimit": 40}'::jsonb),
('Video Ad', 'Video ad for Meta Reels/Stories', 'meta', 'video', '{"maxDuration": 60, "formats": ["stories", "reels", "feed"]}'::jsonb),
('Lead Gen Form', 'Lead generation form ad for Meta', 'meta', 'lead_gen', '{"customQuestions": true, "privacyPolicy": true, "thankYouScreen": true}'::jsonb);