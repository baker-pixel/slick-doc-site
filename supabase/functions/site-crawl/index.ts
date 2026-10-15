import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { handleOptions, jsonResponse } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { checkAdminAuth, checkClientOrAdminAuth, isServiceRequest } from "../_shared/auth.ts";
import { enqueueAuditForCrawl, queueCrawl } from "../_shared/crawler/queue.ts";
import { buildCrawlStatus } from "../_shared/crawler/status.ts";

// Start, watch and cancel a full-site crawl. Starting only queues the job: the worker
// (process-site-crawl) does the work in the background, and `status` is what the
// progress card polls. A client can start and watch their own crawl; only an admin can
// cancel one or override the page cap.
const RECENT_CRAWL_HOURS = 6;
// A crawl this fresh is good enough for "run audit": no need to read the whole site again.
const FRESH_CRAWL_HOURS = 12;

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const supabase = serviceClient();
  try {
    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? "status";
    const service = isServiceRequest(req);

    // Cancel works from a crawl id, so look up whose it is first.
    let clientId: string | undefined = body.client_id ?? body.clientId;
    if (action === "cancel") {
      if (!body.crawl_id) return jsonResponse({ error: "crawl_id is required" }, 400);
      const { data: c } = await supabase.from("site_crawls").select("id, client_account_id, status").eq("id", body.crawl_id).maybeSingle();
      if (!c) return jsonResponse({ error: "Crawl not found" }, 404);
      const admin = service || (await checkAdminAuth(req, supabase, body.password)).authorized;
      if (!admin) return jsonResponse({ error: "Unauthorized" }, 401);
      if (c.status === "queued" || c.status === "running") {
        await supabase.from("site_crawls").update({ status: "cancelled", phase: "done", finished_at: new Date().toISOString(), error: "Cancelled." }).eq("id", c.id);
      }
      return jsonResponse({ ok: true, crawl_id: c.id });
    }

    if (!clientId) return jsonResponse({ error: "client_id is required" }, 400);
    const auth = service ? { authorized: true, role: "admin" as const } : await checkClientOrAdminAuth(req, supabase, clientId, body.password);
    if (!auth.authorized) return jsonResponse({ error: "Unauthorized" }, 401);
    const isAdmin = service || auth.role !== "client";

    if (action === "status") return jsonResponse(await buildCrawlStatus(supabase, clientId));

    if (action !== "start" && action !== "audit") return jsonResponse({ error: `Unknown action "${action}"` }, 400);

    const full = body.full === true;
    const maxPages = isAdmin && Number.isFinite(Number(body.max_pages)) ? Number(body.max_pages) : undefined;
    const trigger: string = body.trigger ?? (isAdmin ? "manual" : "client");

    // "audit" = what the Run audit button does: audit from a recent crawl straight away, else crawl first and let the audit follow.
    if (action === "audit") {
      const since = new Date(Date.now() - FRESH_CRAWL_HOURS * 3600_000).toISOString();
      const { data: fresh } = await supabase.from("site_crawls").select("id").eq("client_account_id", clientId).eq("status", "complete").gte("finished_at", since).order("finished_at", { ascending: false }).limit(1).maybeSingle();
      const { data: running } = await supabase.from("site_crawls").select("id").eq("client_account_id", clientId).in("status", ["queued", "running"]).maybeSingle();
      if (fresh && !running && !full) {
        const ok = await enqueueAuditForCrawl(supabase, fresh.id, clientId, { again: true });
        if (!ok) return jsonResponse({ error: "Couldn't queue the analysis. Try again in a moment." }, 500);
        return jsonResponse({ ...(await buildCrawlStatus(supabase, clientId)), started: true, mode: "audit_only" });
      }
      const q = await queueCrawl(supabase, clientId, { trigger, runAudit: true, full, maxPages });
      if (!q.ok) return jsonResponse({ error: q.error }, q.status);
      return jsonResponse({ ...(await buildCrawlStatus(supabase, clientId)), started: q.started, reason: q.reason, mode: "crawl_then_audit" });
    }

    // Clients can't hammer it: a crawl that finished recently is reused.
    if (!isAdmin) {
      const since = new Date(Date.now() - RECENT_CRAWL_HOURS * 3600_000).toISOString();
      const { data: recent } = await supabase.from("site_crawls").select("id").eq("client_account_id", clientId).eq("status", "complete").gte("finished_at", since).limit(1).maybeSingle();
      if (recent) return jsonResponse({ ...(await buildCrawlStatus(supabase, clientId)), started: false, reason: "recent" });
    }

    const q = await queueCrawl(supabase, clientId, { trigger, runAudit: body.then_audit === true, full, maxPages });
    if (!q.ok) return jsonResponse({ error: q.error }, q.status);
    return jsonResponse({ ...(await buildCrawlStatus(supabase, clientId)), started: q.started, reason: q.reason });
  } catch (err) {
    console.error("[site-crawl]", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
