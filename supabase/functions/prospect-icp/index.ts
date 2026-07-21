import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkAdminAuth } from "../_shared/auth.ts";
import { callAIJson, MODELS } from "../_shared/ai.ts";
import { ensureClientICP, suggestDiscoveryQueries } from "../_shared/icp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  client_id: string;
  /** "suggest": return ICP + discovery query suggestions. "check": validate a manual query against the ICP. */
  action: "suggest" | "check";
  query?: string;
  location?: string;
  password?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body: RequestBody = await req.json();

    const auth = await checkAdminAuth(req, supabase, body.password);
    if (!auth.authorized) return json({ error: "Unauthorized" }, 401);

    if (!body.client_id || !body.action) {
      return json({ error: "client_id and action are required" }, 400);
    }

    const { data: client, error: clientErr } = await supabase
      .from("client_accounts")
      .select("id, business_name, industry, icp, context_profile")
      .eq("id", body.client_id)
      .single();

    if (clientErr || !client) return json({ error: "Client not found" }, 404);

    const icp = await ensureClientICP(supabase, client);
    if (!icp) {
      return json({ error: "Could not derive an ICP for this client -- fill in its context profile first" }, 422);
    }

    if (body.action === "check") {
      if (!body.query) return json({ error: "query is required for action=check" }, 400);

      const verdict = await callAIJson<{ fit: boolean; reason: string }>({
        source: "prospect-icp",
        clientId: client.id,
        model: MODELS.fast,
        jsonMode: true,
        maxTokens: 150,
        promptId: "icp-query-check.v1",
        prompt: `An admin wants to search Google Maps for "${body.query}"${body.location ? ` in "${body.location}"` : ""} to find prospects for this client.

CLIENT'S IDEAL CUSTOMER PROFILE:
- Summary: ${icp.summary}
- Industries: ${icp.industries.join(", ")}
- Geography: ${icp.geography}
- Disqualifiers: ${(icp.disqualifiers || []).join("; ") || "none"}

Would businesses found by that search plausibly match this ICP? Be strict about industry match; be lenient about location wording.
Return ONLY valid JSON: { "fit": true|false, "reason": "<one short sentence>" }`,
      });

      return json({ icp, fit: verdict.fit === true, reason: verdict.reason || "" });
    }

    // action === "suggest"
    const suggestions = await suggestDiscoveryQueries(client.id, icp);

    return json({
      icp,
      maps_suitable: icp.local,
      suggestions,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("prospect-icp error:", msg);
    return json({ error: msg }, 500);
  }
});
