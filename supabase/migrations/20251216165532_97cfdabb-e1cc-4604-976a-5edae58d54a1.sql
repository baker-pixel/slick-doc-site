-- Drop the existing constraint and recreate with all job types
ALTER TABLE public.automation_jobs DROP CONSTRAINT IF EXISTS automation_jobs_job_type_check;

ALTER TABLE public.automation_jobs ADD CONSTRAINT automation_jobs_job_type_check CHECK (job_type IN (
  'weekly_report',
  'monthly_report', 
  'content_generation',
  'seo_audit',
  'competitor_analysis',
  'generate_social_posts',
  'generate_blog_post',
  'generate_email_campaign',
  'generate_seo_recommendations',
  'create_analytics_dashboard',
  'generate_ad_copy',
  'build_review_funnel',
  'create_lead_magnet',
  'setup_email_automation',
  'website_audit',
  'keyword_research',
  'backlink_analysis',
  'social_media_audit',
  'conversion_optimization',
  'brand_voice_guide',
  'generate_client_report',
  'add_segmentation_logic_to_funnel_steps',
  'build_renewal_reminder_sequence',
  'custom',
  'email_sequence',
  'generate_report',
  'run_seo_audit',
  'report'
));