import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkClientOrAdminAuth } from "../_shared/auth.ts";
import { unlockReadySteps } from "../_shared/workflowUnlock.ts";

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

    const result = await unlockReadySteps(supabase, workflow_id, completed_step_number, client_id ?? null);

    return json({ success: true, unlocked: result.unlocked, all_done: result.all_done });
  } catch (err: any) {
    console.error("advance-workflow error:", err);
    return json({ error: err?.message || "Internal error" }, 500);
  }
});
