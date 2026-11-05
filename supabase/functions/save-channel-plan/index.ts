import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkClientOrAdminAuth } from "../_shared/auth.ts";
import { tierPolicy } from "../_shared/tierPolicy.ts";
import { type PlanInput, validateChannelPlan } from "../_shared/channelPlan.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Saves a client's channel plan (which channels, how the monthly quota splits).
// Callable by the client's portal users and by admins. All validation is here,
// not in the UI: the channels must be connected and a custom split must add up
// to the tier quota. Scheduling picks the plan up on its next run; whether it
// applies to the current cycle or the next is reported back as `applies`.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const clientAccountId: string | undefined = body.clientAccountId;
    if (!clientAccountId) return json({ error: "clientAccountId is required" }, 400);

    const auth = await checkClientOrAdminAuth(req, supabase, clientAccountId, body.password);
    if (!auth.authorized) return json({ error: "Unauthorized" }, 401);

    if (body.mode !== "even" && body.mode !== "custom") return json({ error: "mode must be 'even' or 'custom'" }, 400);
    if (!Array.isArray(body.channels)) return json({ error: "channels must be a list" }, 400);
    const input: PlanInput = {
      mode: body.mode,
      channels: body.channels.map((c: any) => ({
        platform: String(c?.platform ?? ""),
        active: c?.active === true,
        count: typeof c?.count === "number" ? c.count : undefined,
      })),
    };

    const { data: client, error: clientErr } = await supabase
      .from("client_accounts")
      .select("tier")
      .eq("id", clientAccountId)
      .maybeSingle();
    if (clientErr || !client) return json({ error: "Client not found" }, 404);
    const quota = tierPolicy(client.tier).social.postsPerMonth;

    const { data: accounts } = await supabase
      .from("client_postforme_accounts")
      .select("platform")
      .eq("client_id", clientAccountId)
      .eq("status", "connected");
    const connected = new Set<string>((accounts ?? []).map((a: any) => a.platform));

    const check = validateChannelPlan(input, { connected, quota });
    if (!check.ok) return json({ error: check.error }, 400);

    const now = new Date().toISOString();
    const rows = input.channels.map((c) => ({
      client_account_id: clientAccountId,
      platform: c.platform,
      active: c.active,
      weight: c.active ? check.weights[c.platform] : 0,
      updated_at: now,
    }));
    const { error: upsertErr } = await supabase
      .from("client_channel_plan")
      .upsert(rows, { onConflict: "client_account_id,platform" });
    if (upsertErr) throw new Error(`Saving the plan failed: ${upsertErr.message}`);

    // A cycle that already has a snapshot keeps its split; this plan starts with the next one.
    const { data: cycle } = await supabase
      .from("client_cycles")
      .select("channel_plan")
      .eq("client_account_id", clientAccountId)
      .in("status", ["planning", "active"])
      .gt("period_end", now)
      .order("period_end", { ascending: false })
      .limit(1)
      .maybeSingle();
    const applies = cycle?.channel_plan ? "next_cycle" : "current_cycle";

    return json({ success: true, applies, weights: check.weights });
  } catch (error) {
    console.error("save-channel-plan error:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
