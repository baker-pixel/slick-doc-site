import { supabase } from "@/integrations/supabase/client";

export type ClientStepTaskType =
  | "client_form"
  | "client_upload"
  | "client_oauth"
  | "client_calendar"
  | "client_approval";

/**
 * Atomically complete a client-driven onboarding step and cascade the
 * unlock, from the client portal (browser, client JWT). Guards on
 * status = "pending" server-side (matches the workflow_steps RLS policy and
 * the run-automation/scan-wordpress-site completion pattern) instead of a
 * client-side read-then-write, which was racy and got copy-pasted
 * inconsistently across every client-step completion call site.
 */
export async function completeWorkflowStep(
  clientAccountId: string,
  taskType: ClientStepTaskType,
): Promise<boolean> {
  const { data: wf } = await supabase
    .from("client_workflows")
    .select("id")
    .eq("client_id", clientAccountId)
    .eq("status", "active")
    .maybeSingle();
  if (!wf) return false;

  const { data: step, error } = await supabase
    .from("workflow_steps")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("workflow_id", wf.id)
    .eq("task_type", taskType)
    .eq("status", "pending")
    .select("id, step_number")
    .maybeSingle();

  if (error) {
    console.error(`completeWorkflowStep(${taskType}) failed:`, error.message);
    return false;
  }
  if (!step) return false;

  supabase.functions
    .invoke("advance-workflow", {
      body: {
        workflow_id: wf.id,
        completed_step_number: step.step_number,
        client_id: clientAccountId,
      },
    })
    .catch((e) => console.error("advance-workflow failed:", e));

  return true;
}
