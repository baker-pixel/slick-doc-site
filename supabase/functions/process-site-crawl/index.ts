import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders, handleOptions, jsonResponse } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { checkPipelineAuth } from "../_shared/auth.ts";
import { logAlert, functionErrorAlert } from "../_shared/alerts.ts";
import { crawlStep } from "../_shared/crawler/engine.ts";
import { SupabaseCrawlStore } from "../_shared/crawler/supabaseStore.ts";
import { fetchTextSafe, safeFetch } from "../_shared/crawler/fetcher.ts";
import { makeRenderer } from "../_shared/crawler/render.ts";
import { enqueueAuditForCrawl } from "../_shared/crawler/queue.ts";
import type { CrawlRow } from "../_shared/crawler/types.ts";

// The crawl worker. pg_cron calls this every minute (only while a crawl is queued or
// running). Each call claims ONE crawl via a lease, crawls for up to STEP_MS, then hands
// the crawl back by clearing the lease -- the next minute's call continues it. A crash
// just lets the lease expire, so nothing is ever lost or stuck.
const STEP_MS = 100_000;
const LEASE_SECONDS = 150;
const MAX_CONSECUTIVE_ERRORS = 5;

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const supabase = serviceClient();
  if (!(await checkPipelineAuth(req, supabase))) return jsonResponse({ error: "Unauthorized" }, 401);

  let crawl: CrawlRow | null = null;
  try {
    const { data, error } = await supabase.rpc("claim_site_crawl", { p_lease_seconds: LEASE_SECONDS });
    if (error) throw new Error(`claim_site_crawl: ${error.message}`);
    crawl = ((data as CrawlRow[] | null) ?? [])[0] ?? null;
    if (!crawl) return jsonResponse({ ok: true, claimed: false });

    const store = new SupabaseCrawlStore(supabase);
    const deps = {
      fetchPage: (u: string) => safeFetch(u),
      fetchText: (u: string) => fetchTextSafe(u),
      render: makeRenderer(),
      now: () => Date.now(),
      sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    };

    const summary = await crawlStep(store, deps, crawl.id, { deadline: Date.now() + STEP_MS });

    // A healthy step clears the error streak and hands the crawl back.
    const fresh = await store.loadCrawl(crawl.id);
    const { errors: _drop, ...restConfig } = fresh.config as Record<string, unknown>;
    await store.patchCrawl(crawl.id, { config: restConfig });

    if (summary.status === "complete") {
      // A crawl started for an audit hands over to it now (durable queue: retried, dead-lettered, never lost).
      if (fresh.run_audit && !fresh.audit_enqueued_at) {
        const queued = await enqueueAuditForCrawl(supabase, crawl.id, crawl.client_account_id);
        if (!queued) await logAlert(supabase, { source: "process-site-crawl", alertType: "site_crawl_audit_not_queued", severity: "error", sourceId: crawl.id, title: `Crawl finished but the audit could not be queued (${fresh.origin})`, message: "enqueue failed; the client will see the crawl but no new audit until it is re-run.", metadata: { crawl_id: crawl.id } });
      }
      // Keep the three most recent crawls per client; older ones and their pages are dropped.
      await supabase.rpc("prune_site_crawls", { p_client: crawl.client_account_id, p_keep: 3 }).then(() => {}, (e: unknown) => console.error("prune failed", e));
    }

    if (summary.status === "failed") {
      await logAlert(supabase, {
        source: "process-site-crawl", alertType: "site_crawl_failed", severity: "warning", sourceId: crawl.id,
        title: `Site crawl failed for ${fresh.origin}`,
        message: fresh.error ?? summary.note ?? "The crawl failed.",
        metadata: { crawl_id: crawl.id, client_account_id: crawl.client_account_id, origin: fresh.origin },
      });
    }
    return jsonResponse({ ok: true, claimed: true, crawl_id: crawl.id, ...summary });
  } catch (err) {
    console.error("[process-site-crawl] step failed:", err);
    if (crawl) {
      // Count consecutive failed steps; a crawl that can't make progress is failed with a reason, not retried forever.
      try {
        const { data: row } = await supabase.from("site_crawls").select("config").eq("id", crawl.id).maybeSingle();
        const config = (row?.config ?? {}) as Record<string, unknown>;
        const errors = Number(config.errors ?? 0) + 1;
        if (errors >= MAX_CONSECUTIVE_ERRORS) {
          await supabase.from("site_crawls").update({
            status: "failed", phase: "done", finished_at: new Date().toISOString(),
            error: "The crawl hit repeated internal errors and was stopped. We've been alerted.",
            config: { ...config, errors },
          }).eq("id", crawl.id);
        } else {
          await supabase.from("site_crawls").update({ config: { ...config, errors } }).eq("id", crawl.id);
        }
      } catch (e) { console.error("[process-site-crawl] could not record error:", e); }
    }
    await functionErrorAlert(supabase, "process-site-crawl", err, { crawl_id: crawl?.id });
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } finally {
    // Always hand the crawl back so the next minute's worker can continue it.
    if (crawl) await supabase.from("site_crawls").update({ claimed_at: null }).eq("id", crawl.id).then(() => {}, () => {});
  }
});
