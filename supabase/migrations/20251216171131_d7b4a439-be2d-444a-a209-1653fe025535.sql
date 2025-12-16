ALTER TABLE public.automation_jobs
  DROP CONSTRAINT IF EXISTS automation_jobs_job_type_check;

ALTER TABLE public.automation_jobs
  ADD CONSTRAINT automation_jobs_job_type_check
  CHECK (
    job_type = ANY (
      ARRAY[
        'weekly_report'::text,
        'monthly_report'::text,
        'content_generation'::text,
        'seo_audit'::text,
        'competitor_analysis'::text,
        'generate_social_posts'::text,
        'generate_blog_post'::text,
        'generate_email_campaign'::text,
        'generate_seo_recommendations'::text,
        'create_analytics_dashboard'::text,
        'generate_ad_copy'::text,
        'build_review_funnel'::text,
        'create_lead_magnet'::text,
        'setup_email_automation'::text,
        'website_audit'::text,
        'keyword_research'::text,
        'backlink_analysis'::text,
        'social_media_audit'::text,
        'conversion_optimization'::text,
        'brand_voice_guide'::text,
        'generate_client_report'::text,
        'add_segmentation_logic_to_funnel_steps'::text,
        'build_renewal_reminder_sequence'::text,
        'build_review_to_case_study_workflow'::text,
        'custom'::text,
        'email_sequence'::text,
        'generate_report'::text,
        'run_seo_audit'::text,
        'report'::text
      ]
    )
  );