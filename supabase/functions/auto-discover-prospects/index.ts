import { clientIdsWithMailbox } from "../_shared/outreachMailbox.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/http.ts";
import { tierPolicy } from "../_shared/tierPolicy.ts";
import { recentDiscoveryRun } from "../_shared/discoveryCooldown.ts";
import { checkPipelineAuth } from "../_shared/auth.ts";
import { logAlert } from "../_shared/alerts.ts";

// Daily cron: keeps every client's prospect pipeline topped up without any
// admin or client action. For each active client on a prospecting-enabled
// tier, if their review queue is thin and no discovery ran recently, it
// calls discover-prospects (Maps) or discover-prospects-web (AI search)
// with no query -- both derive their search from the client's ICP.
// Auth: pg_cron (x-internal-secret "pipeline_cron"), service key, or admin.
// A request that names a single `client_id` is an admin manually
// jump-starting one client (e.g. right after onboarding, instead of waiting
// for the next 9am UTC sweep) and skips the queue-floor/cooldown skips below
// since it's an explicit one-off, not the daily topping-up pass.

// Daily target: every eligible client gets up to tierPolicy.prospect.discoveryBatch
// new leads per day. The ceiling only stops spend piling up on leads nobody
// has reviewed; the cooldown only stops a manual run + the cron double-billing
// the same day (shorter than 24h so the 09:00 sweep is never skipped).
const REVIEW_QUEUE_CEILING = 40;
const COOLDOWN_MS = 20 * 60 * 60 * 1000;
const ALERT_DEDUPE_MS = 7 * 24 * 60 * 60 * 1000;

// A blocked or stalled client would otherwise re-alert every day; one alert
// per client+reason per week is enough to be seen without becoming noise.
async function alertOnce(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  clientId: string,
  alertType: string,
  title: string,
  message: string,
) {
  const since = new Date(Date.now() - ALERT_DEDUPE_MS).toISOString();
  const { data } = await supabase
    .from("automation_alerts")
    .select("id")
    .eq("source", "auto-discover-prospects")
    .eq("alert_type", alertType)
    .eq("source_id", clientId)
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();
  if (data) return;
  await logAlert(supabase, {
    source: "auto-discover-prospects",
    sourceId: clientId,
    alertType,
    severity: "warning",
    title,
    message,
  });
}

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
    const { client_id: onlyClientId, password } = await req.json().catch(() => ({}));

    // Both the daily sweep (pg_cron, x-internal-secret) and the single-client
    // jump-start (admin) spend paid Maps/Apollo/AI calls, so neither is open
    // to a bare anon key.
    if (!(await checkPipelineAuth(req, supabase, password))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientQuery = supabase
      .from("client_accounts")
      .select("id, business_name, tier, icp")
      .eq("status", "active");
    const { data: clients, error } = onlyClientId
      ? await clientQuery.eq("id", onlyClientId)
      : await clientQuery;
    if (error) throw error;

    if (onlyClientId && (clients ?? []).length === 0) {
      return new Response(JSON.stringify({ error: "Client not found or not active" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mailboxClients = await clientIdsWithMailbox(supabase, ((clients ?? []) as ClientRow[]).map((c) => c.id));

    let attempted = 0;
    let erroredCount = 0;

    for (const client of (clients ?? []) as ClientRow[]) {
      const policy = tierPolicy(client.tier).prospect;
      if (!policy.enabled) {
        results[client.id] = "skipped: prospect agent not enabled for this tier";
        continue;
      }
      if (!mailboxClients.has(client.id)) {
        results[client.id] = "skipped: no email mailbox connected";
        if (!onlyClientId) {
          await alertOnce(
            supabase,
            client.id,
            "prospect_blocked_no_mailbox",
            `${client.business_name}: lead discovery blocked`,
            "No email mailbox is connected, so daily lead discovery and outreach are paused for this client until one is.",
          );
        }
        continue;
      }

      // The manual single-client trigger is an explicit "do it now" --
      // skip the daily sweep's queue-floor and cooldown throttles.
      if (!onlyClientId) {
        const { count: queueCount } = await supabase
          .from("prospects")
          .select("id", { count: "exact", head: true })
          .eq("client_id", client.id)
          .eq("status", "discovered");
        if ((queueCount ?? 0) >= REVIEW_QUEUE_CEILING) {
          results[client.id] = `skipped: ${queueCount} leads awaiting review (ceiling ${REVIEW_QUEUE_CEILING})`;
          if (!onlyClientId) {
            await alertOnce(
              supabase,
              client.id,
              "prospect_review_backlog",
              `${client.business_name}: lead review backlog`,
              `${queueCount} leads are waiting for review, so daily discovery is paused until they're approved or rejected.`,
            );
          }
          continue;
        }

        if (await recentDiscoveryRun(supabase, client.id, COOLDOWN_MS)) {
          results[client.id] = "skipped: ran within cooldown";
          continue;
        }
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
          if (!onlyClientId && (data.discovered ?? 0) === 0) {
            await alertOnce(
              supabase,
              client.id,
              "prospect_zero_yield",
              `${client.business_name}: discovery found no new leads`,
              `Today's ${fn} run returned 0 new leads. The ICP may be too narrow or the search source may be failing.`,
            );
          }
        }
      } catch (e) {
        erroredCount++;
        results[client.id] = `error: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    console.log("auto-discover-prospects:", JSON.stringify(results));

    // A partial failure (one client's Maps/ICP/Apollo call failing while the
    // rest succeed) still returns 200 below, so it never showed up in cron
    // monitoring -- a client could go weeks with no new leads and no signal.
    if (erroredCount > 0 && !onlyClientId) {
      const failed = Object.entries(results).filter(([, v]) => v.startsWith("error:"));
      await logAlert(supabase, {
        source: "auto-discover-prospects",
        alertType: "prospect_discovery_failed",
        severity: "warning",
        title: `Prospect discovery failed for ${erroredCount} client(s)`,
        message: failed.map(([id, v]) => `${id}: ${v}`).join("\n").slice(0, 900),
        metadata: { attempted, errored: erroredCount, failed: Object.fromEntries(failed) },
      });
    }

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
