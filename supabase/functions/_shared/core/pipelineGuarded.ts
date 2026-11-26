// Functions that only crons / other functions / the admin panel may call, and
// must therefore call requirePipelineAuth (or checkPipelineAuth). Each maps to the
// pg_cron job name(s) that call it. pipelineGuarded.test.ts asserts this list against
// (a) each function's source and (b) the cron migrations that send the secret, so
// the function side and the cron side can't drift apart.
export const PIPELINE_CRON_JOBS: Record<string, string[]> = {
  "check-image-batches": ["check-image-batches"],
  "check-stalled-workflows": ["check-stalled-workflows"],
  "client-context-refresh": ["client-context-refresh"],
  "detect-inactive-leads": ["detect-inactive-leads"],
  "process-agent-jobs": ["process-agent-jobs"],
  "run-ai-batch": ["daily-client-automation", "weekly-client-reports", "monthly-client-reports"],
  "send-approval-reminders": ["send-approval-reminders"],
  "seo-reaudit-scan": ["seo-reaudit-scan"],
  "send-weekly-recap": ["weekly-portal-recap"],
  "check-alerts": ["check-alerts"],
};

export const PIPELINE_GUARDED_FUNCTIONS = Object.keys(PIPELINE_CRON_JOBS);
