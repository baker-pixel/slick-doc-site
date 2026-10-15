import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { handleOptions, jsonResponse } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { checkAdminAuth, checkClientOrAdminAuth, isServiceRequest } from "../_shared/auth.ts";
import { tierPolicy } from "../_shared/tierPolicy.ts";
import { checkUrlSafe } from "../_shared/crawler/ssrf.ts";
import { buildCrawlStatus } from "../_shared/crawler/status.ts";

// Start, watch and cancel a full-site crawl. Starting only queues the job: the worker
// (process-site-crawl) does the work in the background, and `status` is what the
// progress card polls. A client can start and watch their own crawl; only an admin can
// cancel one or override the page cap.
const RECENT_CRAWL_HOURS = 6;

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

    if (action !== "start") return jsonResponse({ error: `Unknown action "${action}"` }, 400);

    const { data: client } = await supabase
      .from("client_accounts").select("id, business_name, website_url, tier, status").eq("id", clientId).maybeSingle();
    if (!client) return jsonResponse({ error: "Client not found" }, 404);
    if (!client.website_url?.trim()) return jsonResponse({ error: "This client has no website address yet. Add one first." }, 422);

    let origin: string;
    try {
      const raw = client.website_url.trim();
      origin = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).origin;
    } catch { return jsonResponse({ error: "The website address isn't a valid URL." }, 422); }
    const safe = checkUrlSafe(origin + "/");
    if (!safe.ok) return jsonResponse({ error: `That website address can't be crawled: ${safe.reason}.` }, 422);

    // One active crawl per client: return it instead of starting another.
    const { data: active } = await supabase.from("site_crawls").select("id").eq("client_account_id", clientId).in("status", ["queued", "running"]).maybeSingle();
    if (active) return jsonResponse({ ...(await buildCrawlStatus(supabase, clientId)), started: false, reason: "already_running" });

    // Clients can't hammer it: a crawl that finished recently is reused.
    if (!isAdmin) {
      const since = new Date(Date.now() - RECENT_CRAWL_HOURS * 3600_000).toISOString();
      const { data: recent } = await supabase.from("site_crawls").select("id").eq("client_account_id", clientId).eq("status", "complete").gte("finished_at", since).limit(1).maybeSingle();
      if (recent) return jsonResponse({ ...(await buildCrawlStatus(supabase, clientId)), started: false, reason: "recent" });
    }

    const policyMax = tierPolicy(client.tier).seo.crawlMaxPages;
    const requested = isAdmin && Number.isFinite(Number(body.max_pages)) ? Math.floor(Number(body.max_pages)) : policyMax;
    const maxPages = Math.min(5000, Math.max(1, requested));

    const { error: insErr } = await supabase.from("site_crawls").insert({
      client_account_id: clientId, origin, max_pages: maxPages, trigger: body.trigger ?? (isAdmin ? "manual" : "client"),
    });
    // 23505 = another request started one a moment ago: that's fine, report it.
    if (insErr && insErr.code !== "23505") throw new Error(`could not queue crawl: ${insErr.message}`);

    return jsonResponse({ ...(await buildCrawlStatus(supabase, clientId)), started: !insErr });
  } catch (err) {
    console.error("[site-crawl]", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
