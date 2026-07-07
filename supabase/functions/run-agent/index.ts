import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions, jsonResponse, errorResponse } from "../_shared/http.ts";
import { checkAdminAuth } from "../_shared/auth.ts";
import { runAgentLoop } from "./loop.ts";
import { findTool } from "./tools.ts";
import type { ClientData } from "../run-automation/types.ts";

interface StartBody {
  action?: "start";
  clientId: string;
  goal: string;
  password?: string;
}

interface ResolveActionBody {
  action: "resolve_action";
  pendingActionId: string;
  decision: "approved" | "rejected";
  password?: string;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = (await req.json()) as StartBody | ResolveActionBody;

    const auth = await checkAdminAuth(req, supabase, body.password);
    if (!auth.authorized) return errorResponse("Unauthorized", 401);

    if (body.action === "resolve_action") {
      return await resolveAction(supabase, body, auth.userId);
    }

    return await startRun(supabase, body as StartBody);
  } catch (err) {
    console.error("run-agent error:", err);
    return errorResponse(err);
  }
});

async function startRun(supabase: any, body: StartBody) {
  const { clientId, goal } = body;
  if (!clientId || !goal?.trim()) {
    return errorResponse("clientId and goal are required", 400);
  }

  const { data: client, error: clientError } = await supabase
    .from("client_accounts")
    .select("*")
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    return errorResponse(`Client not found: ${clientError?.message ?? "unknown"}`, 404);
  }

  const { data: trace, error: traceError } = await supabase
    .from("agent_traces")
    .insert({ client_id: clientId, goal, status: "running" })
    .select()
    .single();

  if (traceError || !trace) {
    return errorResponse(`Failed to create agent trace: ${traceError?.message}`, 500);
  }

  const result = await runAgentLoop(supabase, client as ClientData, goal, trace.id);

  await supabase
    .from("agent_traces")
    .update({
      status: result.status,
      stop_reason: result.stop_reason,
      steps: result.steps,
      step_count: result.step_count,
      final_summary: result.final_summary,
      error_message: result.error_message,
      finished_at: new Date().toISOString(),
    })
    .eq("id", trace.id);

  return jsonResponse({ success: result.status !== "failed", trace: result });
}

async function resolveAction(
  supabase: any,
  body: ResolveActionBody,
  decidedBy: string | null,
) {
  const { pendingActionId, decision } = body;
  if (!pendingActionId || !["approved", "rejected"].includes(decision)) {
    return errorResponse("pendingActionId and a valid decision are required", 400);
  }

  const { data: pending, error: fetchErr } = await supabase
    .from("agent_pending_actions")
    .select("*")
    .eq("id", pendingActionId)
    .single();

  if (fetchErr || !pending) {
    return errorResponse("Pending action not found", 404);
  }
  if (pending.status !== "pending") {
    return errorResponse(`Action already ${pending.status}`, 409);
  }

  if (decision === "rejected") {
    await supabase
      .from("agent_pending_actions")
      .update({ status: "rejected", decided_by: decidedBy, decided_at: new Date().toISOString() })
      .eq("id", pendingActionId);
    return jsonResponse({ success: true, status: "rejected" });
  }

  const { data: client, error: clientError } = await supabase
    .from("client_accounts")
    .select("*")
    .eq("id", pending.client_id)
    .single();

  if (clientError || !client) {
    return errorResponse(`Client not found: ${clientError?.message ?? "unknown"}`, 404);
  }

  const tool = findTool(pending.tool_name);
  if (!tool) {
    return errorResponse(`Unknown tool: ${pending.tool_name}`, 500);
  }

  try {
    const result = await tool.run(supabase, client as ClientData, pending.tool_input as Record<string, unknown>);
    await supabase
      .from("agent_pending_actions")
      .update({
        status: "approved",
        decided_by: decidedBy,
        decided_at: new Date().toISOString(),
        result,
      })
      .eq("id", pendingActionId);
    return jsonResponse({ success: true, status: "approved", result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase
      .from("agent_pending_actions")
      .update({
        status: "approved",
        decided_by: decidedBy,
        decided_at: new Date().toISOString(),
        error_message: message,
      })
      .eq("id", pendingActionId);
    return errorResponse(`Approved but execution failed: ${message}`, 500);
  }
}
