import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { errorResponse, handleOptions, jsonResponse } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { checkAdminAuth } from "../_shared/auth.ts";
import { decideProposal } from "../_shared/steward/proposals.ts";

// Admin-only: list steward proposals and approve or reject them. Approving an
// executable proposal runs it; advisory ones are recorded for a person to carry out.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["shadow", "pending", "approved", "rejected", "executed", "failed", "expired"];

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return errorResponse("use POST", 405);

  const supabase = serviceClient();
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return errorResponse("invalid JSON", 400); }

  const auth = await checkAdminAuth(req, supabase, body.password);
  if (!auth.authorized) return errorResponse("Unauthorized", 401);

  try {
    if (body.action === "list") {
      const status = body.status ?? "pending";
      if (!STATUSES.includes(status)) return errorResponse(`status must be one of: ${STATUSES.join(", ")}`, 400);
      let q = supabase.from("agent_proposals")
        .select("id, client_account_id, engine, run_id, goal_id, tool, args, summary, rationale, side_effect, status, decision_note, result, created_at, decided_at")
        .eq("status", status).order("created_at", { ascending: false }).limit(100);
      if (body.client_id) {
        if (!UUID.test(body.client_id)) return errorResponse("client_id must be a UUID", 400);
        q = q.eq("client_account_id", body.client_id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return jsonResponse({ proposals: data });
    }

    if (body.action === "decide") {
      if (typeof body.id !== "string" || !UUID.test(body.id)) return errorResponse("id must be a UUID", 400);
      if (body.decision !== "approve" && body.decision !== "reject") return errorResponse('decision must be "approve" or "reject"', 400);
      const out = await decideProposal(supabase, {
        proposalId: body.id, decision: body.decision, note: typeof body.note === "string" ? body.note.slice(0, 500) : undefined,
        actorUserId: auth.userId, allowedClientIds: null,
      });
      return out.ok ? jsonResponse(out) : jsonResponse(out, 409);
    }

    return errorResponse('action must be "list" or "decide"', 400);
  } catch (e) {
    console.error("[steward-proposals]", e);
    return errorResponse(e, 500);
  }
});
