-- Drop the existing constraint and add the new one with the additional job type
ALTER TABLE public.automation_jobs DROP CONSTRAINT automation_jobs_job_type_check;

ALTER TABLE public.automation_jobs ADD CONSTRAINT automation_jobs_job_type_check CHECK (job_type = ANY (ARRAY[
  'send_intake_form'::text, 
  'add_to_crm'::text, 
  'schedule_kickoff'::text, 
  'run_seo_audit'::text, 
  'run_pagespeed_test'::text, 
  'generate_report'::text, 
  'send_welcome_email'::text, 
  'create_dashboard'::text, 
  'setup_review_system'::text, 
  'email_sequence'::text, 
  'content_generation'::text, 
  'social_post'::text, 
  'blog_post'::text, 
  'weekly_report'::text, 
  'monthly_report'::text, 
  'ai_automation'::text, 
  'custom'::text, 
  'report'::text,
  'add_segmentation_logic_to_funnel_steps'::text
]));