import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkClientOrAdminAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Map client-facing task_type → client_onboarding column to sync */
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { workflow_id, completed_step_number, client_id, password } = await req.json();

    if (!workflow_id || completed_step_number == null) {
      return json({ error: "workflow_id and completed_step_number are required" }, 400);
    }

    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const isServer = bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!isServer) {
      const auth = await checkClientOrAdminAuth(req, supabase, client_id, password);
      if (!auth.authorized) return json({ error: "Unauthorized" }, 401);
    }

    // 1. Fetch all steps for this workflow
    const { data: allSteps, error: stepsErr } = await supabase
      .from("workflow_steps")
      .select("id, step_number, task_type, status, depends_on, payload")
      .eq("workflow_id", workflow_id)
      .order("step_number");

    if (stepsErr) throw new Error(stepsErr.message);
    if (!allSteps || allSteps.length === 0) return json({ success: true, unlocked: 0 });

    // Build current state (treat completed_step_number as "completed" even if DB not caught up yet)
    const stateMap = new Map(allSteps.map((s) => [s.step_number, { ...s }]));
    const completedStepObj = stateMap.get(completed_step_number);
    if (completedStepObj) completedStepObj.status = "completed";

    // 2. Unlock steps whose dependency is now satisfied
    const clientToUnlock: string[] = [];
    const automationToUnlock: { id: string; step_number: number; task_type: string; payload: any }[] = [];

    for (const [, step] of stateMap) {
      if (step.status !== "locked") continue;
      if (step.depends_on == null) continue;
      const dep = stateMap.get(step.depends_on);
      if (dep && dep.status === "completed") {
        if (CLIENT_STEP_TYPES.has(step.task_type)) {
          step.status = "pending";
          clientToUnlock.push(step.id);
        } else {
          step.status = "in_progress";
          automationToUnlock.push({ id: step.id, step_number: step.step_number, task_type: step.task_type, payload: (step as any).payload });
        }
      }
    }

    if (clientToUnlock.length > 0) {
      await supabase.from("workflow_steps").update({ status: "pending" }).in("id", clientToUnlock);
    }
    if (automationToUnlock.length > 0) {
      await supabase.from("workflow_steps").update({ status: "in_progress" }).in("id", automationToUnlock.map((s) => s.id));
    }

    const toUnlock = [...clientToUnlock, ...automationToUnlock.map((s) => s.id)];

    // 3. Determine new current_step and whether the whole workflow is done
    const sortedSteps = [...stateMap.values()].sort((a, b) => a.step_number - b.step_number);
    const nextIncomplete = sortedSteps.find((s) => s.status !== "completed");
    const allDone = !nextIncomplete;

    await supabase
      .from("client_workflows")
      .update({
        current_step: nextIncomplete?.step_number ?? sortedSteps[sortedSteps.length - 1].step_number,
        ...(allDone ? { status: "completed" } : {}),
      })
      .eq("id", workflow_id);

    // 4. Sync client_onboarding side-effects
    const resolvedClientId: string | null =
      client_id ??
      await supabase
        .from("client_workflows")
        .select("client_id")
        .eq("id", workflow_id)
        .single()
        .then(({ data }) => data?.client_id ?? null);

    if (resolvedClientId && completedStepObj) {
      const syncField = ONBOARDING_SYNC[completedStepObj.task_type];
      if (syncField) {
        await supabase
          .from("client_onboarding")
          .update({ [syncField]: new Date().toISOString() })
          .eq("client_account_id", resolvedClientId);
      }

      // Check if all 5 client-facing onboarding steps are now done
      const onboardingSteps = sortedSteps.filter((s) => CLIENT_STEP_TYPES.has(s.task_type));
      const allOnboardingDone =
        onboardingSteps.length > 0 && onboardingSteps.every((s) => s.status === "completed");

      if (allOnboardingDone) {
        await supabase
          .from("client_onboarding")
          .update({ onboarding_completed_at: new Date().toISOString() })
          .eq("client_account_id", resolvedClientId);

        // Phase 4: activate any draft projects now that onboarding is complete
        await supabase
          .from("client_projects")
          .update({ status: "active" })
          .eq("client_account_id", resolvedClientId)
          .eq("status", "draft");
      }
    }

    // 5. Enqueue background jobs for any steps that just unlocked. These used
    // to be fire-and-forget `fetch(...).catch(console.error)` calls -- a
    // dropped network call or a transient 5xx silently stalled the workflow
    // forever with no retry. Enqueueing onto the durable agent_jobs queue
    // (processed by process-agent-jobs, cron every minute) means a failure
    // retries automatically and only dead-letters (with an alert) after
    // repeated failures, and the idempotencyKey means a duplicate enqueue
    // from a race between concurrent advance-workflow calls is a no-op
    // instead of double-firing the side effect.
    const enqueue = (target: string, idempotencyKey: string, body: Record<string, unknown>) =>
      supabase
        .rpc("agent_jobs_enqueue", { msg: { target, idempotencyKey, body } })
        .then(({ error }: { error: unknown }) => {
          if (error) console.error(`Failed to enqueue ${target} job (${idempotencyKey}):`, error);
        });

    // 5a. Fire generate-approval-draft if a client_approval step just unlocked
    if (resolvedClientId) {
      const approvalStep = allSteps.find(
        (s) => clientToUnlock.includes(s.id) && s.task_type === "client_approval"
      );
      if (approvalStep) {
        await enqueue("generate-approval-draft", `approval-draft:${approvalStep.id}`, {
          client_id: resolvedClientId,
          workflow_id,
          step_id: approvalStep.id,
        });
      }
    }

    // 5b. Route automation steps to run-automation. (Previously split n8n_post_social/
    // n8n_post_blog off to trigger-n8n -- removed along with those step definitions in
    // seed-tier-workflow, since real publishing already runs on its own continuous
    // schedule rather than as a one-time onboarding checklist gate. trigger-n8n/
    // n8n-callback are still used directly by publish-scheduled-content for
    // Google Business Profile posts and newsletter sends, which have no
    // non-n8n equivalent.)
    if (automationToUnlock.length > 0 && resolvedClientId) {
      for (const step of automationToUnlock) {
        await enqueue("run-automation", `automation-step:${step.id}`, {
          clientId: resolvedClientId,
          jobType: step.task_type,
          workflowId: workflow_id,
          stepId: step.id,
          stepNumber: step.step_number,
          // run-automation's AutomationRequest reads `inputData`, not `payload` --
          // this was silently dropping every workflow step's context (e.g. the
          // `content_type` payload on "content" steps) since callers never matched.
          inputData: step.payload || {},
          _source: "advance-workflow",
        });
      }
    }

    return json({ success: true, unlocked: toUnlock.length, all_done: allDone });
  } catch (err: any) {
    console.error("advance-workflow error:", err);
    return json({ error: err?.message || "Internal error" }, 500);
  }
});
