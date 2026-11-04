// Queuing a crawl: one place for the rules (valid and safe URL, one active crawl per client,
// incremental when a recent crawl exists, page cap from the plan), used by the start button,
// the audit button and the re-audit cron alike.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { tierPolicy } from "../tierPolicy.ts";
import { checkUrlSafe } from "./ssrf.ts";
import { DEFAULT_TUNING } from "./types.ts";

export interface PreviousCrawl { id: string; finished_at: string | null }

/** Incremental only when the last crawl finished recently enough to trust; otherwise read everything. */
export function planCrawlMode(previous: PreviousCrawl | null, now: number, full: boolean): { mode: "full" | "incremental"; previous_crawl_id: string | null } {
  if (!full && previous?.finished_at) {
    const age = now - Date.parse(previous.finished_at);
    if (Number.isFinite(age) && age >= 0 && age <= DEFAULT_TUNING.maxCarryForwardMs) return { mode: "incremental", previous_crawl_id: previous.id };
  }
  return { mode: "full", previous_crawl_id: null };
}

export type QueueResult =
  | { ok: true; started: boolean; reason?: "already_running" }
  | { ok: false; status: number; error: string };

export async function queueCrawl(
  supabase: SupabaseClient, clientId: string,
  opts: { trigger: string; runAudit: boolean; full?: boolean; maxPages?: number },
): Promise<QueueResult> {
  const { data: client } = await supabase.from("client_accounts").select("id, website_url, tier").eq("id", clientId).maybeSingle();
  if (!client) return { ok: false, status: 404, error: "Client not found" };
  if (!client.website_url?.trim()) return { ok: false, status: 422, error: "This client has no website address yet. Add one first." };

  let origin: string;
  try {
    const raw = client.website_url.trim();
    origin = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).origin;
  } catch { return { ok: false, status: 422, error: "The website address isn't a valid URL." }; }
  const safe = checkUrlSafe(origin + "/");
  if (!safe.ok) return { ok: false, status: 422, error: `That website address can't be crawled: ${safe.reason}.` };

  const { data: active } = await supabase.from("site_crawls").select("id, run_audit").eq("client_account_id", clientId).in("status", ["queued", "running"]).maybeSingle();
  if (active) {
    // Someone wants an audit from a crawl that is already running: make sure the audit follows it.
    if (opts.runAudit && !active.run_audit) await supabase.from("site_crawls").update({ run_audit: true }).eq("id", active.id);
    return { ok: true, started: false, reason: "already_running" };
  }

  const { data: prev } = await supabase.from("site_crawls").select("id, finished_at").eq("client_account_id", clientId).eq("status", "complete").order("finished_at", { ascending: false }).limit(1).maybeSingle();
  const plan = planCrawlMode(prev ?? null, Date.now(), !!opts.full);
  const maxPages = Math.min(5000, Math.max(1, Math.floor(opts.maxPages ?? tierPolicy(client.tier).seo.crawlMaxPages)));

  const { error } = await supabase.from("site_crawls").insert({
    client_account_id: clientId, origin, max_pages: maxPages, trigger: opts.trigger, run_audit: opts.runAudit, ...plan,
  });
  // 23505: another request queued one a moment ago. Fine: report it as already running.
  if (error && error.code !== "23505") return { ok: false, status: 500, error: `could not queue crawl: ${error.message}` };
  return { ok: true, started: !error, reason: error ? "already_running" : undefined };
}

/** Hands a finished crawl to the audit through the durable job queue (retries and dead-lettering included). */
export async function enqueueAuditForCrawl(supabase: SupabaseClient, crawlId: string, clientId: string, opts: { again?: boolean } = {}): Promise<boolean> {
  const { error } = await supabase.rpc("agent_jobs_enqueue", {
    msg: { target: "seo-audit", // The same crawl can legitimately be audited again ("Run audit" twice); only the automatic hand-over is deduped.
      idempotencyKey: opts.again ? `seo-audit-crawl:${crawlId}:${Date.now()}` : `seo-audit-crawl:${crawlId}`, body: { clientId, crawlId } },
  });
  if (error) { console.error("[queue] could not enqueue audit:", error.message); return false; }
  await supabase.from("site_crawls").update({ audit_enqueued_at: new Date().toISOString(), run_audit: true }).eq("id", crawlId);
  return true;
}

/**
 * Hands a finished crawl to the company-profile builder through the same durable queue. The builder itself decides
 * whether anything changed enough to be worth rebuilding, unless `force` is set (the "Rebuild" button).
 */
export async function enqueueProfileForCrawl(supabase: SupabaseClient, crawlId: string, clientId: string, opts: { force?: boolean } = {}): Promise<boolean> {
  const { error } = await supabase.rpc("agent_jobs_enqueue", {
    msg: {
      target: "build-company-profile",
      idempotencyKey: opts.force ? `profile-crawl:${crawlId}:${Date.now()}` : `profile-crawl:${crawlId}`,
      body: { clientId, crawlId, force: !!opts.force },
    },
  });
  if (error) { console.error("[queue] could not enqueue profile build:", error.message); return false; }
  return true;
}
