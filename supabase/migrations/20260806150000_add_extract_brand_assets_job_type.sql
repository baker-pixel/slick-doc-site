-- Brand extraction moves from an untracked fire-and-forget background
-- fetch (in seed-tier-workflow) to a real onboarding step that
-- content_generation/social_strategy steps depends_on, so they no longer
-- race a background scrape that may or may not have finished. Needs its
-- own job_type in the check constraint, same as generate_social_strategy did.
ALTER TABLE automation_jobs DROP CONSTRAINT automation_jobs_job_type_check;
ALTER TABLE automation_jobs ADD CONSTRAINT automation_jobs_job_type_check
  CHECK (job_type = ANY (ARRAY[
    'weekly_report', 'monthly_report', 'content_generation', 'seo_audit',
    'competitor_analysis', 'generate_social_posts', 'generate_blog_post',
    'generate_email_campaign', 'generate_seo_recommendations',
    'create_analytics_dashboard', 'generate_ad_copy', 'build_review_funnel',
    'create_lead_magnet', 'setup_email_automation', 'website_audit',
    'keyword_research', 'backlink_analysis', 'social_media_audit',
    'conversion_optimization', 'brand_voice_guide', 'generate_client_report',
    'add_segmentation_logic_to_funnel_steps', 'build_renewal_reminder_sequence',
    'build_review_to_case_study_workflow', 'custom', 'email_sequence',
    'generate_report', 'run_seo_audit', 'report', 'send_intake_form',
    'add_to_crm', 'schedule_kickoff', 'run_page_speed_test',
    'create_google_review_link', 'create_review_qr_code',
    'setup_review_automation', 'send_review_scripts', 'create_kpi_dashboard',
    'run_keyword_gap_analysis', 'setup_lead_automations',
    'setup_retargeting_audiences', 'setup_retention_automations',
    'generate_monthly_report', 'build_landing_pages', 'build_website_rebuild',
    'run_advanced_seo', 'build_sales_funnel', 'setup_sales_enablement',
    'schedule_strategy_call', 'optimize_crm_pipeline',
    'create_full_analytics_suite', 'generate_social_strategy',
    'extract_brand_assets'
  ]::text[]));
