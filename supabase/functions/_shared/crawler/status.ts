// What the progress card needs: the latest crawl, how far along it is, a rough ETA,
// and (once finished) a breakdown by page type. Pure shaping lives in shapeStatus so
// the percentages and ETA are tested.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { CrawlRow } from "./types.ts";

export interface CrawlStatus {
  crawl: {
    id: string; status: CrawlRow["status"]; phase: CrawlRow["phase"]; origin: string; max_pages: number;
    pages_discovered: number; pages_crawled: number; pages_failed: number; error: string | null;
    created_at: string; started_at: string | null; finished_at: string | null; last_step_at: string | null;
    sitemap_urls_found: number; sitemaps_read: number; renders: number; truncated: boolean;
  } | null;
  percent: number;
  eta_seconds: number | null;
  message: string;
  /** After a crawl that feeds an audit: "analysing" until the audit lands, "failed" if it never does. */
  audit: "analysing" | "done" | "failed" | null;
  breakdown: { page_type: string; pages: number; errors: number; noindex: number }[];
}

/** Percent of known pages finished. Never shows 100 until the crawl is actually complete. */
export function shapeStatus(c: CrawlRow | null, now = Date.now()): Pick<CrawlStatus, "percent" | "eta_seconds" | "message"> {
  if (!c) return { percent: 0, eta_seconds: null, message: "No crawl yet." };
  const finished = c.pages_crawled + c.pages_failed;
  const known = Math.max(c.pages_discovered, finished, 1);
  if (c.status === "complete" && c.run_audit && !c.audit_enqueued_at) return { percent: 100, eta_seconds: 0, message: `Read ${c.pages_crawled} pages. Analysing them now…` };
  if (c.status === "complete") return { percent: 100, eta_seconds: 0, message: `Read ${c.pages_crawled} pages${c.pages_failed ? `, ${c.pages_failed} could not be read` : ""}.` };
  if (c.status === "failed") return { percent: Math.min(99, Math.round((finished / known) * 100)), eta_seconds: null, message: c.error ?? "The crawl failed." };
  if (c.status === "cancelled") return { percent: Math.min(99, Math.round((finished / known) * 100)), eta_seconds: null, message: "Cancelled." };
  if (c.status === "queued" || c.phase === "seed") return { percent: 0, eta_seconds: null, message: "Starting: reading robots.txt and the sitemap…" };

  const percent = Math.min(99, Math.round((finished / known) * 100));
  let eta: number | null = null;
  const started = c.started_at ? Date.parse(c.started_at) : NaN;
  if (Number.isFinite(started) && finished >= 5) {
    const elapsed = (now - started) / 1000;
    const rate = finished / Math.max(elapsed, 1);
    if (rate > 0) eta = Math.round(Math.max(0, known - finished) / rate);
  }
  return { percent, eta_seconds: eta, message: `Reading your website: ${finished} of ${known} pages found so far.` };
}

const AUDIT_GRACE_MS = 20 * 60 * 1000;

/** Where the audit that follows a crawl stands. Pure, so the timeout is tested. */
export function auditState(c: Pick<CrawlRow, "status" | "run_audit" | "audit_enqueued_at"> | null, latestAuditAt: string | null, now = Date.now()): CrawlStatus["audit"] {
  if (!c || c.status !== "complete" || !c.run_audit) return null;
  if (!c.audit_enqueued_at) return "analysing"; // crawl just finished; the worker is about to queue it
  const queued = Date.parse(c.audit_enqueued_at);
  if (latestAuditAt && Date.parse(latestAuditAt) >= queued) return "done";
  return now - queued > AUDIT_GRACE_MS ? "failed" : "analysing";
}

export async function buildCrawlStatus(supabase: SupabaseClient, clientId: string): Promise<CrawlStatus> {
  const { data } = await supabase.from("site_crawls").select("*").eq("client_account_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const c = (data as CrawlRow | null) ?? null;
  const shaped = shapeStatus(c);
  let latestAuditAt: string | null = null;
  if (c?.run_audit) {
    const { data: a } = await supabase.from("seo_audits").select("created_at").eq("client_account_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    latestAuditAt = a?.created_at ?? null;
  }
  const audit = auditState(c, latestAuditAt);
  let breakdown: CrawlStatus["breakdown"] = [];
  if (c && (c.status === "complete" || c.pages_crawled > 0)) {
    const { data: rows } = await supabase.rpc("site_crawl_breakdown", { p_crawl: c.id });
    breakdown = ((rows ?? []) as { page_type: string; pages: number | string; errors: number | string; noindex: number | string }[])
      .map((r) => ({ page_type: r.page_type, pages: Number(r.pages), errors: Number(r.errors), noindex: Number(r.noindex) }));
  }
  return {
    crawl: c && {
      id: c.id, status: c.status, phase: c.phase, origin: c.origin, max_pages: c.max_pages,
      pages_discovered: c.pages_discovered, pages_crawled: c.pages_crawled, pages_failed: c.pages_failed, error: c.error,
      created_at: c.created_at, started_at: c.started_at, finished_at: c.finished_at, last_step_at: c.last_step_at,
      sitemap_urls_found: c.config.sitemapUrlsFound ?? 0, sitemaps_read: c.config.sitemapsRead?.length ?? 0, renders: c.config.renders ?? 0,
      truncated: !!c.config.sitemapTruncated || c.pages_discovered >= c.max_pages,
    },
    breakdown,
    audit,
    ...shaped,
  };
}
