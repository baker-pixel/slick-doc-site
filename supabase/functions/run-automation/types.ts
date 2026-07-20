export type AutomationType =
  | "send_intake_form"
  | "add_to_crm"
  | "schedule_kickoff"
  | "run_page_speed_test"
  | "create_google_review_link"
  | "create_review_qr_code"
  | "setup_review_automation"
  | "send_review_scripts"
  | "create_kpi_dashboard"
  | "create_analytics_dashboard" // legacy DB enum/constraint value
  | "run_seo_audit"
  | "run_keyword_gap_analysis"
  | "setup_lead_automations"
  | "setup_retargeting_audiences"
  | "setup_retention_automations"
  | "generate_monthly_report"
  | "generate_report"
  | "email_sequence"
  | "content_generation"
  | "report"
  | "custom"
  | "add_segmentation_logic_to_funnel_steps"
  | "build_renewal_reminder_sequence"
  | "build_review_to_case_study_workflow"
  | "build_landing_pages"
  | "build_website_rebuild"
  | "run_advanced_seo"
  | "create_lead_magnet"
  | "build_sales_funnel"
  | "setup_sales_enablement"
  | "schedule_strategy_call"
  | "optimize_crm_pipeline"
  | "create_full_analytics_suite";

export interface AutomationRequest {
  clientId: string;
  taskId?: string;
  // Accept string here because callers may send legacy/slightly different slugs (e.g. hyphens)
  jobType: string;
  inputData?: Record<string, unknown>;
  // Present when enqueued by advance-workflow for an onboarding-checklist
  // automation step -- lets this function close the loop back to
  // workflow_steps instead of leaving the step "in_progress" forever.
  workflowId?: string;
  stepId?: string;
  stepNumber?: number;
}

export interface ClientData {
  id: string;
  business_name: string;
  email: string;
  tier: string;
  level: number;
  google_place_id?: string;
  google_review_url?: string;
  review_qr_image_url?: string;
  industry?: string;
  first_name?: string;
  last_name?: string;
  website_url?: string;
  website_summary?: string;
  context_profile?: Record<string, unknown>;
  tone?: string;
}
