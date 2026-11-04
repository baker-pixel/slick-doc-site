import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { errorResponse, handleOptions, jsonResponse } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { checkAdminAuth, isServiceRequest } from "../_shared/auth.ts";
import { ENGINES, type Engine } from "../_shared/clientContext.ts";
import { runSteward, type Trigger } from "../_shared/steward/run.ts";

// Wakes one steward (one client x one engine) for a single bounded run.
// Callers: an admin (session or legacy password) or our own backend (service key).
// What the run may DO is decided by the client's steward_settings, not by the caller.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRIGGERS: Trigger[] = ["manual", "heartbeat", "event"];

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return errorResponse("use POST", 405);

  const supabase = serviceClient();
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return errorResponse("invalid JSON", 400); }

  const service = isServiceRequest(req);
  if (!service && !(await checkAdminAuth(req, supabase, body.password)).authorized) return errorResponse("Unauthorized", 401);

  const clientId = body.client_id;
  const engine = body.engine as Engine;
  const trigger = (body.trigger ?? "manual") as Trigger;
  if (typeof clientId !== "string" || !UUID.test(clientId)) return errorResponse("client_id must be a UUID", 400);
  if (!ENGINES.includes(engine)) return errorResponse(`engine must be one of: ${ENGINES.join(", ")}`, 400);
  if (!TRIGGERS.includes(trigger)) return errorResponse(`trigger must be one of: ${TRIGGERS.join(", ")}`, 400);
  // Only our backend may claim to be the schedule or an event.
  if (trigger !== "manual" && !service) return errorResponse("only the backend may use heartbeat or event triggers", 403);

  try {
    return jsonResponse(await runSteward(supabase, { clientId, engine, trigger }));
  } catch (e) {
    console.error("[steward-run]", e);
    return errorResponse(e, 500);
  }
});
