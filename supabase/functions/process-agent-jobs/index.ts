import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleOptions, jsonResponse, errorResponse } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { logAlert, functionErrorAlert } from "../_shared/alerts.ts";

// Worker for the agent_jobs durable queue (Phase 4). Replaces advance-workflow's
// fire-and-forget `fetch(...).catch(log)` dispatch: a dropped/failed call used
// to silently stall a workflow forever with no retry. This polls the queue,
// dispatches to the right sibling function, and retries via pgmq's visibility
// timeout instead of losing the job.

const BATCH_SIZE = 10;
const VISIBILITY_TIMEOUT_SECONDS = 120;
const MAX_ATTEMPTS = 5;

const TARGET_PATHS: Record<string, string> = {
  "trigger-n8n": "trigger-n8n",
  "run-automation": "run-automation",
  "generate-approval-draft": "generate-approval-draft",
  "seo-audit": "seo-audit",
};

interface AgentJobMessage {
  target: string;
  idempotencyKey: string;
  body: Record<string, unknown>;
}

function isAgentJobMessage(msg: unknown): msg is AgentJobMessage {
  const m = msg as Record<string, unknown>;
  return !!m && typeof m.target === "string" && typeof m.idempotencyKey === "string" && typeof m.body === "object";
}

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const supabase = serviceClient();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminPassword = Deno.env.get("ADMIN_PASSWORD");

  const summary = { read: 0, succeeded: 0, skippedDuplicate: 0, retried: 0, deadLettered: 0, malformed: 0 };

  try {
    // Transient network blips (e.g. TLS handshake EOF) shouldn't kill the
    // whole batch run before any job is even read -- retry a couple times.
    let rows: unknown[] | null = null;
    let readErr: { message: string } | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await supabase.rpc("agent_jobs_read", {
        vt: VISIBILITY_TIMEOUT_SECONDS,
        qty: BATCH_SIZE,
      });
      rows = result.data;
      readErr = result.error;
      if (!readErr) break;
      console.error(`[process-agent-jobs] agent_jobs_read attempt ${attempt} failed:`, readErr.message);
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 500));
    }
    if (readErr) throw new Error(`Failed to read agent_jobs queue: ${readErr.message}`);

    const messages = (rows ?? []) as { msg_id: number; read_ct: number; enqueued_at: string; message: unknown }[];
    summary.read = messages.length;

    for (const row of messages) {
      const { msg_id, read_ct, message } = row;

      if (!isAgentJobMessage(message)) {
        console.error(`[process-agent-jobs] malformed message ${msg_id}, archiving:`, message);
        await supabase.rpc("agent_jobs_archive", { msg_id });
        summary.malformed++;
        continue;
      }

      const { target, idempotencyKey, body } = message;

      // Idempotency: if a prior delivery of this same logical job already
      // succeeded, don't re-fire the side effect (duplicate content, double
      // n8n post, etc.) -- just clear the message.
      const { data: existing } = await supabase
        .from("agent_job_dedupe")
        .select("idempotency_key")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existing) {
        await supabase.rpc("agent_jobs_delete", { msg_id });
        summary.skippedDuplicate++;
        continue;
      }

      const path = TARGET_PATHS[target];
      if (!path) {
        console.error(`[process-agent-jobs] unknown target "${target}" on message ${msg_id}, archiving`);
        await logAlert(supabase, {
          source: "process-agent-jobs",
          alertType: "unknown_job_target",
          severity: "error",
          title: `Unknown agent_jobs target: ${target}`,
          message: `Message ${msg_id} named target "${target}" which has no registered dispatch path.`,
          metadata: { msg_id, target, idempotencyKey },
        });
        await supabase.rpc("agent_jobs_archive", { msg_id });
        summary.malformed++;
        continue;
      }

      try {
        const dispatchBody = target === "run-automation" && adminPassword
          ? { ...body, password: adminPassword }
          : body;

        const res = await fetch(`${supabaseUrl}/functions/v1/${path}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(dispatchBody),
        });

        const resultText = await res.text();
        if (!res.ok) {
          throw new Error(`${target} returned ${res.status}: ${resultText.slice(0, 500)}`);
        }

        let resultJson: unknown = null;
        try {
          resultJson = JSON.parse(resultText);
        } catch {
          resultJson = { raw: resultText.slice(0, 500) };
        }

        await supabase.from("agent_job_dedupe").upsert(
          { idempotency_key: idempotencyKey, result: resultJson },
          { onConflict: "idempotency_key" },
        );
        await supabase.rpc("agent_jobs_delete", { msg_id });
        summary.succeeded++;
      } catch (dispatchErr) {
        const errMsg = dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr);
        console.error(`[process-agent-jobs] dispatch failed for ${target} (msg ${msg_id}, attempt ${read_ct}):`, errMsg);

        if (read_ct >= MAX_ATTEMPTS) {
          await logAlert(supabase, {
            source: "process-agent-jobs",
            alertType: "agent_job_dead_letter",
            severity: "high",
            title: `agent_jobs job dead-lettered: ${target}`,
            message: `Message ${msg_id} (target "${target}", idempotencyKey "${idempotencyKey}") failed ${read_ct} times and was archived: ${errMsg}`,
            metadata: { msg_id, target, idempotencyKey, attempts: read_ct, body },
          });
          await supabase.rpc("agent_jobs_archive", { msg_id });
          summary.deadLettered++;
        } else {
          // Leave the message in the queue -- it becomes visible again after
          // the visibility timeout expires and gets retried on the next poll.
          summary.retried++;
        }
      }
    }

    return jsonResponse({ ok: true, ...summary });
  } catch (err) {
    console.error("process-agent-jobs error:", err);
    await functionErrorAlert(supabase, "process-agent-jobs", err);
    return errorResponse(err);
  }
});
