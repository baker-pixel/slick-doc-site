-- Create gap_analysis_submissions table for comprehensive intake form
CREATE TABLE public.gap_analysis_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Contact Info (from contact_submissions if linked)
  contact_submission_id UUID REFERENCES public.contact_submissions(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  business_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  website_url TEXT,
  
  -- Business Fundamentals
  top_business_goals TEXT,
  growth_satisfaction INTEGER CHECK (growth_satisfaction >= 1 AND growth_satisfaction <= 100),
  primary_customer_sources TEXT,
  top_competitors TEXT,
  unique_differentiator TEXT,
  has_seasonality BOOLEAN,
  seasonality_details TEXT,
  avg_customer_lifetime_value TEXT,
  revenue_new_customers_pct INTEGER,
  revenue_repeat_customers_pct INTEGER,
  revenue_referrals_pct INTEGER,
  
  -- Website & Conversion
  social_media_handles TEXT,
  website_last_updated TEXT,
  tracks_website_conversions BOOLEAN,
  conversion_tracking_method TEXT,
  monthly_website_leads INTEGER,
  
  -- SEO & Local Visibility
  investing_in_seo BOOLEAN,
  ranking_for_keywords BOOLEAN,
  knows_organic_traffic BOOLEAN,
  monthly_organic_traffic INTEGER,
  tracking_keyword_rankings BOOLEAN,
  
  -- Paid Advertising
  running_paid_ads BOOLEAN,
  ad_platforms TEXT,
  monthly_ad_spend TEXT,
  cost_per_lead TEXT,
  ads_match_customer_intent BOOLEAN,
  ad_manager TEXT,
  satisfied_with_ad_performance BOOLEAN,
  ad_performance_notes TEXT,
  cost_per_acquisition TEXT,
  runs_retargeting BOOLEAN,
  ads_use_landing_pages BOOLEAN,
  
  -- Lead Capture & Nurture
  uses_email_automation BOOLEAN,
  uses_sms_followups BOOLEAN,
  has_crm BOOLEAN,
  crm_name TEXT,
  crm_tracks_all_inbound BOOLEAN,
  has_segmentation_drip BOOLEAN,
  has_abandoned_followups BOOLEAN,
  lead_to_customer_conversion_rate TEXT,
  
  -- Sales Enablement
  lead_response_time TEXT,
  close_rate TEXT,
  common_objections TEXT,
  where_prospects_lost TEXT,
  uses_online_scheduling BOOLEAN,
  avg_time_to_quote TEXT,
  
  -- Retention & Reputation
  asks_for_reviews BOOLEAN,
  monthly_new_reviews INTEGER,
  emails_past_customers BOOLEAN,
  has_reputation_tool BOOLEAN,
  reputation_tool_name TEXT,
  repeat_customer_rate TEXT,
  has_loyalty_referral_program BOOLEAN,
  has_post_purchase_followup BOOLEAN,
  
  -- Analytics & Measurement
  uses_google_analytics BOOLEAN,
  knows_best_lead_sources BOOLEAN,
  kpis_tracked TEXT,
  data_accuracy_confidence TEXT,
  kpi_tracking_frequency TEXT,
  analytics_review_frequency TEXT,
  does_ab_testing BOOLEAN,
  has_dashboards JSONB,
  
  -- Internal Capacity
  who_handles_marketing TEXT,
  monthly_marketing_budget TEXT,
  success_definition_3mo TEXT,
  success_definition_6mo TEXT,
  success_definition_12mo TEXT,
  weekly_team_hours TEXT,
  past_marketing_failures TEXT,
  marketing_to_offload TEXT,
  
  -- Mindset & Satisfaction
  biggest_marketing_frustration TEXT,
  suffering_from_weak_digital TEXT,
  least_understood_marketing TEXT,
  automation_wishlist TEXT,
  biggest_agency_fear TEXT,
  
  -- Final Strategic Alignment
  priority_improvement TEXT,
  reason_seeking_help TEXT,
  fastest_impact TEXT,
  what_makes_it_worth_it TEXT,
  additional_notes TEXT,
  
  -- Meta
  status TEXT NOT NULL DEFAULT 'submitted',
  current_step INTEGER DEFAULT 1,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.gap_analysis_submissions ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (public intake form)
CREATE POLICY "Anyone can submit gap analysis" 
ON public.gap_analysis_submissions 
FOR INSERT 
WITH CHECK (true);

-- Allow updates based on id (for multi-step form progress)
CREATE POLICY "Anyone can update their own submission by id" 
ON public.gap_analysis_submissions 
FOR UPDATE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_gap_analysis_submissions_updated_at
BEFORE UPDATE ON public.gap_analysis_submissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();