// deno-lint-ignore-file no-explicit-any
/**
 * Shared onboarding-workflow unlock logic. Extracted out of advance-workflow
 * so the exact same cascade can be re-run by check-stalled-workflows as a
 * periodic reconciliation sweep (a step whose dependency is already
 * "completed" in the DB but which itself is still "locked" -- e.g. a caller
 * that updated the dependency but never invoked the cascade -- silently
 * stalled the rest of the checklist forever with no path to self-heal).
 */

import { logAlert } from "./alerts.ts";
import { seedContextFromLead } from "./onboardingContext.ts";
import { tierPolicy } from "./tierPolicy.ts";

const ONBOARDING_SYNC: Record<string, string> = {
  client_form: "intake_form_completed_at",
  client_calendar: "kickoff_scheduled_at",
};

const CLIENT_STEP_TYPES = new Set([
  "client_form",
  "client_upload",
  "client_oauth",
  "client_calendar",
  "client_approval",
]);

export interface UnlockResult {
  unlocked: number;
  all_done: boolean;
}

export async function unlockReadySteps(
  supabase: any,
  workflowId: string,
  justCompletedStepNumber?: number | null,
  explicitClientId?: string | null
): Promise<UnlockResult> {
  const { data: allSteps, error: stepsErr } = await supabase
    .from("workflow_steps")
    .select("id, step_number, task_type, status, depends_on, payload")
    .eq("workflow_id", workflowId)
    .order("step_number");

  if (stepsErr) throw new Error(stepsErr.message);
  if (!allSteps || allSteps.length === 0) return { unlocked: 0, all_done: false };

  const stateMap = new Map(allSteps.map((s: any) => [s.step_number, { ...s }]));
  const completedStepObj =
    justCompletedStepNumber != null ? (stateMap.get(justCompletedStepNumber) as any) : undefined;
  if (completedStepObj) completedStepObj.status = "completed";

  const clientToUnlock: string[] = [];
  const automationToUnlock: { id: string; step_number: number; task_type: string; payload: any }[] = [];

  for (const [, step] of stateMap as any) {
    if (step.status !== "locked") continue;
    if (step.depends_on == null) continue;
    const dep = stateMap.get(step.depends_on) as any;
    if (dep && dep.status === "completed") {
      if (CLIENT_STEP_TYPES.has(step.task_type)) {
        step.status = "pending";
        clientToUnlock.push(step.id);
      } else {
        step.status = "in_progress";
        automationToUnlock.push({
          id: step.id,
          step_number: step.step_number,
          task_type: step.task_type,
          payload: step.payload,
        });
      }
    }
  }

  if (clientToUnlock.length > 0) {
    await supabase.from("workflow_steps").update({ status: "pending" }).in("id", clientToUnlock);
  }
  if (automationToUnlock.length > 0) {
    await supabase
      .from("workflow_steps")
      .update({ status: "in_progress" })
      .in("id", automationToUnlock.map((s) => s.id));
  }

  const toUnlock = [...clientToUnlock, ...automationToUnlock.map((s) => s.id)];

  const sortedSteps = [...(stateMap as any).values()].sort(
    (a: any, b: any) => a.step_number - b.step_number
  );
  const nextIncomplete = sortedSteps.find((s: any) => s.status !== "completed");
  const allDone = !nextIncomplete;

  await supabase
    .from("client_workflows")
    .update({
      current_step: nextIncomplete?.step_number ?? sortedSteps[sortedSteps.length - 1].step_number,
      ...(allDone ? { status: "completed" } : {}),
    })
    .eq("id", workflowId);

  const resolvedClientId: string | null =
    explicitClientId ??
    (await supabase
      .from("client_workflows")
      .select("client_id")
      .eq("id", workflowId)
      .single()
      .then(({ data }: any) => data?.client_id ?? null));

  // Defined here (not at its previous call site further down) so the
  // onboarding-completion branch below can also use it -- same durable,
  // idempotent job-queue path either way, never a direct function call.
  const enqueue = (target: string, idempotencyKey: string, body: Record<string, unknown>) =>
    supabase
      .rpc("agent_jobs_enqueue", { msg: { target, idempotencyKey, body } })
      .then(({ error }: { error: unknown }) => {
        if (error) {
          console.error(`Failed to enqueue ${target} job (${idempotencyKey}):`, error);
          return logAlert(supabase, {
            source: "workflowUnlock",
            alertType: "agent_job_enqueue_failed",
            severity: "high",
            title: `Failed to enqueue ${target} job`,
            message: `agent_jobs_enqueue RPC failed for idempotencyKey "${idempotencyKey}" (target "${target}"): ${
              (error as { message?: string })?.message ?? error
            }. The workflow_steps row this was meant to advance is now stuck in_progress with no queued job behind it.`,
            metadata: { target, idempotencyKey, body },
          });
        }
      });

  if (resolvedClientId && completedStepObj) {
    const syncField = ONBOARDING_SYNC[completedStepObj.task_type];
    if (syncField) {
      await supabase
        .from("client_onboarding")
        .update({ [syncField]: new Date().toISOString() })
        .eq("client_account_id", resolvedClientId);
    }

    const onboardingSteps = sortedSteps.filter((s: any) => CLIENT_STEP_TYPES.has(s.task_type));
    const allOnboardingDone =
      onboardingSteps.length > 0 && onboardingSteps.every((s: any) => s.status === "completed");

    if (allOnboardingDone) {
      await supabase
        .from("client_onboarding")
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq("client_account_id", resolvedClientId);

      await supabase
        .from("client_projects")
        .update({ status: "active" })
        .eq("client_account_id", resolvedClientId)
        .eq("status", "draft");

      // The moment onboarding completes does exactly one more thing: seed
      // the shared context (brand/ICP/voice, from the original lead's
      // gap-analysis data) so engines have something real to pull. It does
      // NOT enqueue an SEO audit directly -- every tier's automation chain
      // already includes a "run_seo_audit" step (FOUNDATION_STEPS in
      // seed-tier-workflow) that fires within moments of this same
      // onboarding-completion event, hitting the identical seo-audit
      // function. A prior version of this code also enqueued seo-audit
      // here directly "to nudge it sooner" -- that produced two full audits
      // (two crawls + two PageSpeed runs + two seo_audits rows) for every
      // single new client, since the two enqueues use different job-queue
      // idempotency keys and never collide.
      await seedContextFromLead(supabase, resolvedClientId).catch((e: unknown) =>
        console.error("seedContextFromLead failed:", e)
      );

      // Empty shells so the portal shows what's coming instead of a blank
      // Projects tab until each engine's own cron/scan gets around to it.
      // Tier-gating (prospect) is decided here in TS via tierPolicy, not in SQL.
      // `tier` (NOT NULL), not `plan_tier` -- every other tierPolicy() call
      // site in this codebase reads client.tier; plan_tier is a separate,
      // apparently-unused nullable column nothing else consults.
      const { data: activatedClient } = await supabase
        .from("client_accounts")
        .select("tier")
        .eq("id", resolvedClientId)
        .maybeSingle();

      await supabase
        .rpc("bootstrap_client_projects", {
          p_client_account_id: resolvedClientId,
          p_include_prospect: tierPolicy(activatedClient?.tier).prospect.enabled,
        })
        .then(({ error }: { error: unknown }) => {
          if (error) console.error("bootstrap_client_projects failed:", error);
        });
    }
  }

  // If the enqueue RPC itself fails, the workflow_steps row is already
  // flipped to in_progress but no job ever enters the queue -- unlike a
  // dispatch failure (which process-agent-jobs retries and eventually
  // dead-letters with an alert), this failure mode never reaches that
  // safety net at all, so it must alert here or the step is stuck silently
  // forever.
  if (resolvedClientId) {
    const approvalStep = allSteps.find(
      (s: any) => clientToUnlock.includes(s.id) && s.task_type === "client_approval"
    );
    if (approvalStep) {
      await enqueue("generate-approval-draft", `approval-draft:${approvalStep.id}`, {
        client_id: resolvedClientId,
        workflow_id: workflowId,
        step_id: approvalStep.id,
      });
    }
  }

  if (automationToUnlock.length > 0 && resolvedClientId) {
    for (const step of automationToUnlock) {
      await enqueue("run-automation", `automation-step:${step.id}`, {
        clientId: resolvedClientId,
        jobType: step.task_type,
        workflowId,
        stepId: step.id,
        stepNumber: step.step_number,
        inputData: step.payload || {},
        _source: "advance-workflow",
      });
    }
  }

  return { unlocked: toUnlock.length, all_done: allDone };
}
