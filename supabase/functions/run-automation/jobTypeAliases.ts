import type { AutomationType } from "./types.ts";

// Producers of jobType strings -- task templates, seed-tier-workflow step
// defs, older UI, n8n -- aren't on one canonical vocabulary, so this alias
// map is the single place that reconciles whatever they send down to the
// ~30 AutomationTypes the dispatcher actually handles. It's large (100+
// entries) because that's the real number of historical/legacy spellings in
// use, not because it's poorly factored -- pruning an entry risks silently
// breaking a producer that still sends it, for very little benefit (a
// lookup table costs nothing at runtime). Add new aliases here rather than
// hardcoding another spelling check elsewhere.

export const ALLOWED_JOB_TYPES: AutomationType[] = [
  "send_intake_form",
  "add_to_crm",
  "schedule_kickoff",
  "run_page_speed_test",
  "create_google_review_link",
  "create_review_qr_code",
  "setup_review_automation",
  "send_review_scripts",
  // Both are accepted; DB constraint currently allows create_analytics_dashboard
  "create_kpi_dashboard",
  "create_analytics_dashboard",
  "run_seo_audit",
  "run_keyword_gap_analysis",
  "setup_lead_automations",
  "setup_retargeting_audiences",
  "setup_retention_automations",
  "generate_monthly_report",
  "generate_report",
  "email_sequence",
  "content_generation",
  "report",
  "custom",
  "add_segmentation_logic_to_funnel_steps",
  "build_renewal_reminder_sequence",
  "build_review_to_case_study_workflow",
  "build_landing_pages",
  "build_website_rebuild",
  "run_advanced_seo",
  "create_lead_magnet",
  "build_sales_funnel",
  "setup_sales_enablement",
  "schedule_strategy_call",
  "optimize_crm_pipeline",
  "create_full_analytics_suite",
  "generate_social_strategy",
];

export function normalizeJobType(raw: unknown): AutomationType {
  const normalized = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (!normalized) throw new Error("Missing jobType");

  // Backward/legacy aliases sent by older UI/task templates
  // NOTE: DB check constraint currently allows `create_analytics_dashboard` (not `create_kpi_dashboard`).
  const aliasMap: Record<string, AutomationType> = {
    // KPI Dashboard aliases
    build_comprehensive_kpi_dashboards: "create_analytics_dashboard",
    comprehensive_kpi_dashboards: "create_analytics_dashboard",
    kpi_dashboard: "create_analytics_dashboard",
    create_kpi_dashboard: "create_analytics_dashboard",

    // Intake form aliases
    send_client_intake_form: "send_intake_form",
    intake_form: "send_intake_form",

    // Content generation aliases
    write_2_monthly_blog_posts: "content_generation",
    write_monthly_blog_posts: "content_generation",
    generate_blog_post: "content_generation",
    generate_blog_posts: "content_generation",
    google_post: "content_generation",
    social_media_post: "content_generation",
    social_post: "content_generation",
    blog_post: "content_generation",

    // Report aliases
    monthly_report: "generate_monthly_report",
    performance_report: "generate_monthly_report",
    client_report: "generate_monthly_report",

    // SEO aliases
    seo_audit: "run_seo_audit",
    keyword_gap: "run_keyword_gap_analysis",
    keyword_analysis: "run_keyword_gap_analysis",

    // Review system aliases
    review_automation: "setup_review_automation",
    review_link: "create_google_review_link",
    review_qr: "create_review_qr_code",
    review_scripts: "send_review_scripts",

    // Lead automation aliases
    lead_automation: "setup_lead_automations",
    retargeting: "setup_retargeting_audiences",
    retention: "setup_retention_automations",

    // Other aliases
    page_speed: "run_page_speed_test",
    speed_test: "run_page_speed_test",
    crm: "add_to_crm",
    kickoff: "schedule_kickoff",

    // CRM/project tracker aliases
    add_client_to_crm_project_tracker: "add_to_crm",
    add_client_to_crm: "add_to_crm",
    connect_automations_to_crm: "add_to_crm",

    // Landing pages aliases
    landing_page_pack: "build_landing_pages",
    landing_pages: "build_landing_pages",
    build_3_5_landing_pages: "build_landing_pages",
    build_landing_page_pack: "build_landing_pages",

    // Website rebuild aliases
    full_website_rebuild: "build_website_rebuild",
    website_rebuild: "build_website_rebuild",
    rebuild_website: "build_website_rebuild",

    // Advanced SEO aliases
    advanced_seo: "run_advanced_seo",
    advanced_seo_program: "run_advanced_seo",
    run_advanced_seo_program: "run_advanced_seo",

    // Lead magnet aliases
    lead_magnet: "create_lead_magnet",
    lead_magnet_development: "create_lead_magnet",
    create_lead_magnets: "create_lead_magnet",

    // Sales funnel aliases
    full_funnel_buildout: "build_sales_funnel",
    sales_funnel: "build_sales_funnel",
    funnel_buildout: "build_sales_funnel",
    build_complete_sales_funnel: "build_sales_funnel",

    // Sales enablement aliases
    sales_enablement: "setup_sales_enablement",
    sales_enablement_system: "setup_sales_enablement",

    // Strategy call aliases
    monthly_strategy_call: "schedule_strategy_call",
    strategy_call: "schedule_strategy_call",
    schedule_monthly_call: "schedule_strategy_call",

    // CRM pipeline optimization aliases
    crm_pipeline_optimization: "optimize_crm_pipeline",
    crm_pipeline: "optimize_crm_pipeline",
    optimize_crm: "optimize_crm_pipeline",

    // Full analytics suite aliases
    full_analytics_suite: "create_full_analytics_suite",
    analytics_suite: "create_full_analytics_suite",
    full_analytics: "create_full_analytics_suite",

    // Email/SMS sequence aliases
    build_immediate_response_email_for_new_leads: "email_sequence",
    build_immediate_response_email: "email_sequence",
    build_3_5_follow_up_emails_for_leads: "email_sequence",
    build_3_5_follow_up_emails: "email_sequence",
    build_nurture_email_sequence: "email_sequence",
    build_confirmation_sms_for_new_leads: "setup_lead_automations",
    build_confirmation_sms: "setup_lead_automations",
    build_no_response_sms_workflow: "setup_lead_automations",
    build_no_response_sms: "setup_lead_automations",

    // Retargeting/segmentation aliases
    build_retargeting_audiences: "setup_retargeting_audiences",
    add_automated_crm_reminders: "setup_lead_automations",
    add_lead_tagging_and_segmentation: "setup_lead_automations",
    add_team_notifications_for_pipeline_events: "setup_lead_automations",
    add_team_notifications: "setup_lead_automations",

    // Review request system aliases
    build_automated_review_request_system: "setup_review_automation",
    provide_review_request_scripts_templates: "send_review_scripts",

    // KPI/analytics/reporting aliases
    build_kpi_dashboard_outline: "create_analytics_dashboard",
    review_monthly_analytics_and_kpis: "generate_monthly_report",
    prepare_and_send_monthly_performance_summary: "generate_monthly_report",

    // SEO task aliases
    optimize_meta_titles_and_descriptions: "run_seo_audit",
    add_schema_markup: "run_seo_audit",
    optimize_meta_titles: "run_seo_audit",
    meta_title_optimization: "run_seo_audit",
    schema_markup: "run_seo_audit",
    fix_broken_links: "run_seo_audit",
    technical_seo: "run_seo_audit",
    on_page_seo: "run_seo_audit",
    optimize_page_speed: "run_page_speed_test",
    page_speed_optimization: "run_page_speed_test",
    submit_sitemap: "run_seo_audit",
    internal_linking: "run_seo_audit",
    local_seo: "run_seo_audit",
    citation_building: "run_seo_audit",

    // Workflow step task_type aliases (from seed-tier-workflow FOUNDATION_STEPS / GROWTH_EXTRA / TRANSFORMATION_EXTRA)
    website_analysis: "run_page_speed_test",
    gap_report: "run_keyword_gap_analysis",
    social_strategy: "generate_social_strategy",
    content: "content_generation",
    email_template: "email_sequence",
    ad_copy: "content_generation",
    social_content: "content_generation",
    analytics: "create_analytics_dashboard",
  };

  const resolved: AutomationType = aliasMap[normalized] ?? (normalized as AutomationType);

  if (ALLOWED_JOB_TYPES.includes(resolved)) {
    return resolved;
  }

  throw new Error(`Unsupported jobType: ${normalized}`);
}
