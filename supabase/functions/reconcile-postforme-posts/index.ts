import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkPipelineAuth } from "../_shared/auth.ts";
import { applyPfmResult, type PfmPostResult } from "../_shared/pfmResult.ts";

// publish-post marks a row "published" the moment Post for Me accepts it, but
// the platform (Facebook, LinkedIn...) can still reject it afterwards -- e.g. a
// connection missing page permissions. The postforme-webhook is meant to report
// that, but if it is not registered / its secret drifts, failures stay hidden
// as "published". This is the pull-side safety net: for rows PfM accepted but
// nothing has confirmed, ask PfM for the per-account result and apply it.

const PFM_API = "https://api.postforme.dev";
const MIN_AGE_MINUTES = 5;   // give the platform time to process first
const LOOKBACK_DAYS = 45;    // also sweeps historical unconfirmed posts
const BATCH = 20;
const ALERT_AFTER_MINUTES = 60;   // accepted by PfM but still no platform result -> tell an admin
const GIVE_UP_AFTER_DAYS = 7;     // PfM has no result by now; stop re-checking and mark unverifiable
const PACE_MS = 1000;        // PfM returned 429 after ~7 back-to-back lookups

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    let body: { password?: string; dryRun?: boolean } = {};
    try { body = await req.json(); } catch { /* empty body */ }
    if (!(await checkPipelineAuth(req, supabase, body.password))) return json({ error: "Unauthorized" }, 401);

    const pfmApiKey = Deno.env.get("POSTFORME_API_KEY");
    if (!pfmApiKey) return json({ error: "POSTFORME_API_KEY not configured" }, 500);

    const now = Date.now();
    const { data: rows, error } = await supabase
      .from("content_calendar")
      .select("id, metadata, client_account_id, platform, title, postforme_post_id, published_at")
      .eq("status", "published")
      .not("postforme_post_id", "is", null)
      .is("metadata->>publish_confirmed_at", null)
      .is("metadata->>publish_verification", null)
      .lt("published_at", new Date(now - MIN_AGE_MINUTES * 60_000).toISOString())
      .gt("published_at", new Date(now - LOOKBACK_DAYS * 86_400_000).toISOString())
      .order("published_at", { ascending: false })
      .limit(BATCH);
    if (error) throw error;

    // Published rows with no Post for Me id (older manual / legacy paths) have
    // nothing to look up -- mark them so the UI doesn't claim confirmation.
    if (!body.dryRun) {
      const { data: noId } = await supabase
        .from("content_calendar")
        .select("id, metadata")
        .eq("status", "published")
        .is("postforme_post_id", null)
        .is("metadata->>publish_verification", null)
        .is("metadata->>publish_confirmed_at", null)
        .in("platform", ["twitter", "facebook", "linkedin", "instagram"]);
      for (const r of noId ?? []) {
        await supabase.from("content_calendar").update({
          metadata: { ...((r.metadata as Record<string, unknown>) || {}), publish_verification: "unavailable", publish_verification_reason: "no_pfm_post_id", publish_verification_at: new Date().toISOString() },
        }).eq("id", r.id);
      }
    }

    const summary = { checked: 0, confirmed: 0, failed: 0, pending: 0, unverifiable: 0, alerted: 0, errors: 0 };
    const details: Array<Record<string, unknown>> = [];

    for (const [i, row] of (rows ?? []).entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, PACE_MS));
      summary.checked++;
      try {
        const res = await fetch(
          `${PFM_API}/v1/social-post-results?post_id=${encodeURIComponent(row.postforme_post_id)}&limit=10`,
          { headers: { Authorization: `Bearer ${pfmApiKey}` } },
        );
        if (res.status === 429) {
          // Rate limited: stop and let the next cron tick continue. Confirmed
          // rows drop out of the query, so each run makes progress.
          console.warn("reconcile: PfM rate limit hit, stopping this run");
          summary.errors++;
          break;
        }
        if (!res.ok) {
          console.warn(`reconcile: PfM ${res.status} for ${row.postforme_post_id}`);
          summary.errors++;
          continue;
        }
        const payload = await res.json();
        const results: PfmPostResult[] = (Array.isArray(payload) ? payload : payload?.data ?? [])
          .filter((r: PfmPostResult) => r?.post_id === row.postforme_post_id || r?.post_id === undefined);

        if (results.length === 0) {
          summary.pending++;
          const ageMin = (now - new Date(row.published_at).getTime()) / 60_000;
          const meta = (row.metadata as Record<string, unknown>) || {};
          if (!body.dryRun && ageMin > GIVE_UP_AFTER_DAYS * 1440) {
            await supabase.from("content_calendar").update({
              metadata: { ...meta, publish_verification: "unavailable", publish_verification_reason: "no_pfm_result", publish_verification_at: new Date().toISOString() },
            }).eq("id", row.id);
            summary.unverifiable++;
          } else if (!body.dryRun && ageMin > ALERT_AFTER_MINUTES && !meta.unconfirmed_alerted_at) {
            await supabase.from("automation_alerts").insert({
              alert_type: "content_publish_unconfirmed",
              severity: "warning",
              title: `${row.platform} post accepted but not confirmed`,
              message: `Post for Me accepted "${row.title ?? "post"}" over an hour ago but has no platform result yet. Check it on ${row.platform}.`,
              source: "reconcile-postforme-posts",
              source_id: row.id,
              metadata: { client_account_id: row.client_account_id, pfm_post_id: row.postforme_post_id },
            });
            await supabase.from("content_calendar").update({
              metadata: { ...meta, unconfirmed_alerted_at: new Date().toISOString() },
            }).eq("id", row.id);
            summary.alerted++;
          }
          continue;
        }

        // One calendar row = one account, so one result. If PfM ever returns
        // several, any failure wins over success (never hide a rejection).
        const result = results.find((r) => !r.success) ?? results[0];
        details.push({ id: row.id, platform: row.platform, success: result.success, error: result.error ?? null });
        if (!body.dryRun) await applyPfmResult(supabase, row, { ...result, post_id: row.postforme_post_id }, "reconcile-postforme-posts");
        if (result.success) summary.confirmed++;
        else summary.failed++;
      } catch (e) {
        console.error(`reconcile: ${row.id}`, e instanceof Error ? e.message : e);
        summary.errors++;
      }
    }

    console.log("reconcile-postforme-posts:", JSON.stringify(summary));
    return json({ success: true, dryRun: !!body.dryRun, ...summary, details });
  } catch (err) {
    console.error("reconcile-postforme-posts error:", err);
    return json({ success: false, error: err instanceof Error ? err.message : "unknown" }, 500);
  }
});
