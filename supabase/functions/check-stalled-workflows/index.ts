import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleOptions, jsonResponse, errorResponse } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { logAlert, functionErrorAlert } from "../_shared/alerts.ts";
import { unlockReadySteps } from "../_shared/workflowUnlock.ts";

// How long an agent task may sit in "running" before we assume the edge
// function died mid-job (crash/timeout) and reap it.
const TASK_STUCK_MINUTES = 30;
// Automation client_tasks stuck in_progress longer than this get failed so
// the daily auto-run picks them up again.
const CLIENT_TASK_STUCK_MINUTES = 60;

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const supabase = serviceClient();

  try {
    const now = new Date();
    const summary = {
      n8n_timeouts: 0,
      stuck_tasks: 0,
      orphaned_steps: 0,
      stuck_client_tasks: 0,
      reconciled_workflows: 0,
      reconciled_steps: 0,
      stale_draft_alert: 0,
    };

    // ── Sweep 1: n8n callback timeouts (original behavior) ──────────────
    const { data: stalled, error } = await supabase
      .from("workflow_steps")
      .select("id, workflow_id, client_id, step_number, step_name, callback_deadline")
      .eq("status", "awaiting_callback")
      .not("callback_deadline", "is", null)
      .lt("callback_deadline", now.toISOString());

    if (error) throw error;

    for (const step of stalled ?? []) {
      await supabase
        .from("workflow_steps")
        .update({
          status: "failed",
          result: { error: "n8n callback timeout — no response within 2 hours" },
        })
        .eq("id", step.id)
        .eq("status", "awaiting_callback");

      await logAlert(supabase, {
        source: "check-stalled-workflows",
        alertType: "n8n_callback_timeout",
        severity: "high",
        title: `Step ${step.step_number} timed out`,
        message: `Step ${step.step_number} (${step.step_name}) timed out waiting for n8n callback`,
        sourceId: step.workflow_id,
      });
      summary.n8n_timeouts++;
    }

    // ── Sweep 2: workflow_tasks stuck in "running" ──────────────────────
    // An agent function sets running, then crashes/times out → row is stuck
    // forever. Reap after TASK_STUCK_MINUTES of no updates.
    const taskCutoff = new Date(now.getTime() - TASK_STUCK_MINUTES * 60_000).toISOString();
    const { data: stuckTasks, error: stuckErr } = await supabase
      .from("workflow_tasks")
      .select("id, client_id, task_type, updated_at")
      .eq("status", "running")
      .lt("updated_at", taskCutoff);

    if (stuckErr) throw stuckErr;

    for (const task of stuckTasks ?? []) {
      await supabase
        .from("workflow_tasks")
        .update({
          status: "failed",
          result: {
            error: `Task stuck in running for over ${TASK_STUCK_MINUTES} minutes — reaped (agent likely crashed or timed out)`,
          },
        })
        .eq("id", task.id)
        .eq("status", "running");

      // Fail the workflow step that spawned it so the workflow doesn't hang.
      await supabase
        .from("workflow_steps")
        .update({
          status: "failed",
          result: { error: `Underlying task ${task.id} was reaped after being stuck in running` },
        })
        .eq("task_id", task.id)
        .eq("status", "running");

      await logAlert(supabase, {
        source: "check-stalled-workflows",
        alertType: "stuck_task_reaped",
        severity: "high",
        title: `Stuck ${task.task_type} task reaped`,
        message: `workflow_task ${task.id} (${task.task_type}) sat in "running" past ${TASK_STUCK_MINUTES} min and was marked failed. Last update: ${task.updated_at}`,
        metadata: { task_id: task.id, client_id: task.client_id, task_type: task.task_type },
      });
      summary.stuck_tasks++;
    }

    // ── Sweep 3: workflow_steps "running" whose task already failed ─────
    // Keeps step state consistent when a task failed but the step update
    // was dropped (fire-and-forget chaining).
    const { data: runningSteps, error: rsErr } = await supabase
      .from("workflow_steps")
      .select("id, step_number, step_name, workflow_id, task_id")
      .eq("status", "running")
      .not("task_id", "is", null);

    if (rsErr) throw rsErr;

    if (runningSteps && runningSteps.length > 0) {
      const taskIds = runningSteps.map((s) => s.task_id as string);
      const { data: failedTasks } = await supabase
        .from("workflow_tasks")
        .select("id")
        .in("id", taskIds)
        .eq("status", "failed");

      const failedIds = new Set((failedTasks ?? []).map((t) => t.id));
      for (const step of runningSteps) {
        if (!failedIds.has(step.task_id as string)) continue;
        await supabase
          .from("workflow_steps")
          .update({
            status: "failed",
            result: { error: "Linked task failed but step was left running — synced by reaper" },
          })
          .eq("id", step.id)
          .eq("status", "running");

        await logAlert(supabase, {
          source: "check-stalled-workflows",
          alertType: "orphaned_step_synced",
          severity: "warning",
          title: `Step ${step.step_number} synced to failed`,
          message: `Step ${step.step_number} (${step.step_name}) was running but its task had already failed.`,
          sourceId: step.workflow_id,
        });
        summary.orphaned_steps++;
      }
    }

    // ── Sweep 4: automation client_tasks stuck in_progress ──────────────
    // Failing them re-queues them for the next auto-run-client-tasks pass.
    const clientTaskCutoff = new Date(now.getTime() - CLIENT_TASK_STUCK_MINUTES * 60_000).toISOString();
    const { data: stuckClientTasks, error: ctErr } = await supabase
      .from("client_tasks")
      .select("id, name, client_account_id, updated_at")
      .eq("status", "in_progress")
      .in("automation_type", ["FULL", "AI", "AUTOMATED"])
      .lt("updated_at", clientTaskCutoff);

    if (ctErr) throw ctErr;

    for (const ct of stuckClientTasks ?? []) {
      await supabase
        .from("client_tasks")
        .update({
          status: "failed",
          blocked_reason: `Automation stuck in_progress for over ${CLIENT_TASK_STUCK_MINUTES} min — auto-failed by reaper; will retry on next automation run`,
        })
        .eq("id", ct.id)
        .eq("status", "in_progress");

      await logAlert(supabase, {
        source: "check-stalled-workflows",
        alertType: "stuck_client_task_reaped",
        severity: "warning",
        title: `Stuck automation task reaped: ${ct.name}`,
        message: `client_task ${ct.id} (${ct.name}) sat in "in_progress" past ${CLIENT_TASK_STUCK_MINUTES} min and was failed for retry. Last update: ${ct.updated_at}`,
        metadata: { client_task_id: ct.id, client_account_id: ct.client_account_id },
      });
      summary.stuck_client_tasks++;
    }

    // ── Sweep 5: reconcile in-progress workflows ─────────────────────────
    // A step can end up "locked" forever even though its dependency is
    // already "completed" -- e.g. a caller updates the dependency step
    // directly without invoking advance-workflow, or a previous
    // advance-workflow call dropped before finishing its unlock pass.
    // Re-running the same idempotent unlock cascade here catches those:
    // it's a no-op for a workflow that's already consistent.
    const { data: activeWorkflows, error: wfErr } = await supabase
      .from("client_workflows")
      .select("id")
      .neq("status", "completed");

    if (wfErr) throw wfErr;

    for (const wf of activeWorkflows ?? []) {
      try {
        const result = await unlockReadySteps(supabase, wf.id);
        if (result.unlocked > 0) {
          summary.reconciled_workflows++;
          summary.reconciled_steps += result.unlocked;
          await logAlert(supabase, {
            source: "check-stalled-workflows",
            alertType: "workflow_reconciled",
            severity: "warning",
            title: `Stalled workflow step(s) unlocked`,
            message: `Reconciliation sweep unlocked ${result.unlocked} step(s) on workflow ${wf.id} that were ready but never advanced.`,
            sourceId: wf.id,
          });
        }
      } catch (reconcileErr) {
        console.error(`Reconciliation failed for workflow ${wf.id}:`, reconcileErr);
      }
    }

    // ── Sweep 6: stale GBP/newsletter draft backlog ──────────────────────
    // These two platforms deliberately require a manual admin "send for
    // approval" click (unlike facebook/instagram/twitter/linkedin, which
    // auto-forward -- see fill-scheduled-content's AUTO_FORWARD_PLATFORMS)
    // and have no reminder today. A draft that never gets reviewed just
    // silently never publishes -- surface it instead of leaving it invisible.
    const STALE_DRAFT_HOURS = 48;
    const staleDraftCutoff = new Date(now.getTime() - STALE_DRAFT_HOURS * 60 * 60_000).toISOString();
    const { data: staleDrafts, error: draftErr } = await supabase
      .from("content_calendar")
      .select("id, client_account_id, platform, created_at")
      .in("platform", ["google_business", "email"])
      .eq("status", "draft")
      .eq("client_approved", false)
      .lt("created_at", staleDraftCutoff);

    if (draftErr) throw draftErr;

    if (staleDrafts && staleDrafts.length > 0) {
      const { data: existingAlert } = await supabase
        .from("automation_alerts")
        .select("id")
        .eq("alert_type", "stale_draft_backlog")
        .is("acknowledged_at", null)
        .maybeSingle();

      // Only one open alert at a time -- re-alerting every 30 min while an
      // admin hasn't acknowledged the last one yet would just be noise.
      if (!existingAlert) {
        const oldestCreatedAt = staleDrafts.reduce(
          (min, d) => (d.created_at < min ? d.created_at : min),
          staleDrafts[0].created_at
        );
        const clientCount = new Set(staleDrafts.map((d) => d.client_account_id)).size;

        await logAlert(supabase, {
          source: "check-stalled-workflows",
          alertType: "stale_draft_backlog",
          severity: "warning",
          title: `${staleDrafts.length} Google Business/email draft(s) awaiting review`,
          message: `${staleDrafts.length} Google Business Profile / newsletter draft(s) across ${clientCount} client(s) have sat unreviewed for over ${STALE_DRAFT_HOURS}h (oldest created ${oldestCreatedAt}). These platforms require a manual "send for approval" click and will never auto-publish.`,
          metadata: { count: staleDrafts.length, client_count: clientCount, oldest_created_at: oldestCreatedAt },
        });
        summary.stale_draft_alert = 1;
      }
    }

    return jsonResponse({ checked: true, ...summary });
  } catch (err) {
    console.error("check-stalled-workflows error:", err);
    await functionErrorAlert(supabase, "check-stalled-workflows", err);
    return errorResponse(err);
  }
});
