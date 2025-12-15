-- Drop the existing constraint and add a new one with all job types including existing ones
ALTER TABLE automation_jobs DROP CONSTRAINT IF EXISTS automation_jobs_job_type_check;

ALTER TABLE automation_jobs ADD CONSTRAINT automation_jobs_job_type_check CHECK (
  job_type IN (
    'send_intake_form',
    'add_to_crm', 
    'schedule_kickoff',
    'run_seo_audit',
    'run_pagespeed_test',
    'generate_report',
    'send_welcome_email',
    'create_dashboard',
    'setup_review_system',
    'email_sequence',
    'content_generation',
    'social_post',
    'blog_post',
    'weekly_report',
    'monthly_report',
    'ai_automation',
    'custom',
    'report'
  )
);