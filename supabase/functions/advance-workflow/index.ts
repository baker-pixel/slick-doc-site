import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkClientOrAdminAuth } from "../_shared/auth.ts";
import { unlockReadySteps } from "../_shared/workflowUnlock.ts";
import { functionErrorAlert } from "../_shared/alerts.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

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

    // completeWorkflowStep.ts calls this fire-and-forget from the browser --
    // if the tab navigates away mid-request, a plain `await` here can get
    // cancelled by the runtime along with the client connection, silently
    // killing the unlock cascade partway through (the "pending" flip commits,
    // the job enqueue after it never runs, no error anywhere). waitUntil
    // keeps the isolate alive to finish the cascade regardless.
    const unlockPromise = unlockReadySteps(supabase, workflow_id, completed_step_number, client_id ?? null);
    EdgeRuntime?.waitUntil(unlockPromise);
    const result = await unlockPromise;

    return json({ success: true, unlocked: result.unlocked, all_done: result.all_done });
  } catch (err: any) {
    console.error("advance-workflow error:", err);
    await functionErrorAlert(supabase, "advance-workflow", err);
    return json({ error: err?.message || "Internal error" }, 500);
  }
});
