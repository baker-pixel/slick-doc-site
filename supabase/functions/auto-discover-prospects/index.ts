import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/http.ts";
import { tierPolicy } from "../_shared/tierPolicy.ts";
import { recentDiscoveryRun } from "../_shared/discoveryCooldown.ts";

// Daily cron: keeps every client's prospect pipeline topped up without any
// admin or client action. For each active client on a prospecting-enabled
// tier, if their review queue is thin and no discovery ran recently, it
// calls discover-prospects (Maps) or discover-prospects-web (AI search)
// with no query -- both derive their search from the client's ICP.
// No auth check: invoked only by pg_cron with the service role, same
// pattern as run-prospect-drip.

const REVIEW_QUEUE_FLOOR = 8; // skip clients who already have plenty to review
const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // don't re-run discovery for a client more often than this

interface ClientRow {
  id: string;
  business_name: string;
  tier: string | null;
  icp: { local?: boolean } | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const results: Record<string, string> = {};

  try {
    const { data: clients, error } = await supabase
      .from("client_accounts")
      .select("id, business_name, tier, icp")
      .eq("status", "active");
    if (error) throw error;

    let attempted = 0;
    let erroredCount = 0;

    for (const client of (clients ?? []) as ClientRow[]) {
      const policy = tierPolicy(client.tier).prospect;
      if (!policy.enabled) continue;

      const { count: queueCount } = await supabase
        .from("prospects")
        .select("id", { count: "exact", head: true })
        .eq("client_id", client.id)
        .eq("status", "discovered");
      if ((queueCount ?? 0) >= REVIEW_QUEUE_FLOOR) {
        results[client.id] = `skipped: queue has ${queueCount}`;
        continue;
      }

      if (await recentDiscoveryRun(supabase, client.id, COOLDOWN_MS)) {
        results[client.id] = "skipped: ran within cooldown";
        continue;
      }

      attempted++;
      const fn = client.icp?.local === false ? "discover-prospects-web" : "discover-prospects";
      try {
        const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${fn}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            client_id: client.id,
            max_results: policy.discoveryBatch,
            password: Deno.env.get("ADMIN_PASSWORD"),
          }),
        });
        const data = await res.json();
        if (data.error) {
          erroredCount++;
          results[client.id] = `error: ${data.error}`;
        } else {
          results[client.id] = `discovered ${data.discovered ?? 0} via ${fn}`;
        }
      } catch (e) {
        erroredCount++;
        results[client.id] = `error: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    console.log("auto-discover-prospects:", JSON.stringify(results));

    // Every attempted client failing (e.g. the ADMIN_PASSWORD secret this
    // relies on got rotated) is a systemic problem, not a per-client one --
    // surface it as a failed run instead of a quiet 200 so uptime/monitoring
    // on this endpoint actually catches it.
    if (attempted > 0 && erroredCount === attempted) {
      return new Response(JSON.stringify({ error: "All attempted clients failed", results }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("auto-discover-prospects error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
