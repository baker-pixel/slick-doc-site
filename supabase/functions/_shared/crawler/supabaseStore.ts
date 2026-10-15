// CrawlStore over Supabase (service role). Thin on purpose: all logic lives in the engine.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { AuditPageRow } from "./auditInput.ts";
import type { CrawlRow, CrawlStore, NewPage, PageCounts, PagePatch, PageRow, PreviousPage } from "./types.ts";

const chunk = <T>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

export class SupabaseCrawlStore implements CrawlStore {
  constructor(private db: SupabaseClient) {}

  async loadCrawl(id: string): Promise<CrawlRow> {
    return check(await this.db.from("site_crawls").select("*").eq("id", id).single(), "load crawl") as CrawlRow;
  }

  async patchCrawl(id: string, patch: Partial<Omit<CrawlRow, "id">>): Promise<void> {
    check(await this.db.from("site_crawls").update(patch).eq("id", id).select("id"), "patch crawl");
  }

  async counts(crawlId: string): Promise<PageCounts> {
    const rows = check(await this.db.rpc("site_crawl_counts", { p_crawl: crawlId }), "count pages") as Record<string, number | string>[];
    const r = rows?.[0] ?? {};
    return { total: Number(r.total ?? 0), pending: Number(r.pending ?? 0), done: Number(r.done ?? 0), failed: Number(r.failed ?? 0), skipped: Number(r.skipped ?? 0) };
  }

  async insertPages(rows: NewPage[]): Promise<number> {
    let inserted = 0;
    for (const part of chunk(rows, 300)) {
      const data = check(
        await this.db.from("site_pages").upsert(part, { onConflict: "crawl_id,url_key", ignoreDuplicates: true }).select("id"),
        "insert pages",
      ) as { id: string }[];
      inserted += data?.length ?? 0;
    }
    return inserted;
  }

  async existingKeys(crawlId: string, keys: string[]): Promise<Set<string>> {
    const out = new Set<string>();
    for (const part of chunk(keys, 200)) {
      const rows = check(await this.db.rpc("site_pages_existing_keys", { p_crawl: crawlId, p_keys: part }), "existing keys") as { url_key: string }[];
      for (const r of rows ?? []) out.add(r.url_key);
    }
    return out;
  }

  async pathCounts(crawlId: string, pathKeys: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    for (const part of chunk(pathKeys, 200)) {
      const rows = check(await this.db.rpc("site_pages_path_counts", { p_crawl: crawlId, p_paths: part }), "path counts") as { path_key: string; n: number | string }[];
      for (const r of rows ?? []) out.set(r.path_key, Number(r.n));
    }
    return out;
  }

  async takePending(crawlId: string, limit: number): Promise<PageRow[]> {
    const now = new Date().toISOString();
    const rows = check(
      await this.db.from("site_pages")
        .select("id, crawl_id, url, url_key, path_key, depth, source, page_type, priority, status, attempts")
        .eq("crawl_id", crawlId).eq("status", "pending")
        .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
        .order("priority", { ascending: true }).order("depth", { ascending: true })
        .limit(limit),
      "take pending",
    );
    return (rows ?? []) as PageRow[];
  }

  async savePage(pageId: string, patch: PagePatch): Promise<void> {
    check(await this.db.from("site_pages").update(patch).eq("id", pageId).select("id"), "save page");
  }

  async loadPrevious(prevCrawlId: string, keys: string[]): Promise<Map<string, PreviousPage>> {
    const out = new Map<string, PreviousPage>();
    for (const part of chunk(keys, 100)) {
      const rows = check(await this.db.rpc("site_pages_previous", { p_crawl: prevCrawlId, p_keys: part }), "load previous") as PreviousPage[];
      for (const r of rows ?? []) out.set(r.url_key, r);
    }
    return out;
  }
}

/** All of a crawl's pages, in the shape the audit needs, read in pages so no crawl size hits a row limit. */
export async function loadAuditRows(db: SupabaseClient, crawlId: string): Promise<AuditPageRow[]> {
  const out: AuditPageRow[] = [];
  const PAGE = 500;
  for (let from = 0; ; from += PAGE) {
    const rows = check(await db.rpc("site_pages_for_audit", { p_crawl: crawlId }).range(from, from + PAGE - 1), "load crawl pages") as AuditPageRow[];
    out.push(...(rows ?? []));
    if (!rows || rows.length < PAGE) break;
  }
  return out;
}
