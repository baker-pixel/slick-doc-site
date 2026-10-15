// In-memory CrawlStore for tests (and for dry runs against a fake website).
import type { CrawlRow, CrawlStore, NewPage, PageCounts, PagePatch, PageRow, PreviousPage } from "./types.ts";

type StoredPage = PageRow & PagePatch & { client_account_id: string; next_attempt_at?: string | null };

export class MemoryStore implements CrawlStore {
  crawls = new Map<string, CrawlRow>();
  pages: StoredPage[] = [];
  private seq = 0;
  constructor(private now: () => number = () => Date.now()) {}

  addCrawl(c: Partial<CrawlRow> & { id: string; origin: string }): CrawlRow {
    const row: CrawlRow = {
      client_account_id: "client-1", max_pages: 100, status: "queued", phase: "seed", trigger: "manual",
      pages_discovered: 0, pages_crawled: 0, pages_failed: 0, error: null, config: {},
      created_at: new Date(this.now()).toISOString(), started_at: null, finished_at: null, last_step_at: null,
      previous_crawl_id: null, mode: "full", run_audit: false, audit_enqueued_at: null, ...c,
    };
    this.crawls.set(row.id, row);
    return row;
  }
  async loadCrawl(id: string) { const c = this.crawls.get(id); if (!c) throw new Error("no crawl"); return structuredClone(c); }
  async patchCrawl(id: string, patch: Partial<CrawlRow>) { Object.assign(this.crawls.get(id)!, patch); }
  async counts(crawlId: string): Promise<PageCounts> {
    const mine = this.pages.filter((p) => p.crawl_id === crawlId);
    const n = (s: string) => mine.filter((p) => p.status === s).length;
    return { total: mine.length, pending: n("pending"), done: n("done"), failed: n("failed"), skipped: n("skipped") };
  }
  async insertPages(rows: NewPage[]) {
    let n = 0;
    for (const r of rows) {
      if (this.pages.some((p) => p.crawl_id === r.crawl_id && p.url_key === r.url_key)) continue;
      this.pages.push({ ...r, id: `p${++this.seq}`, status: "pending", attempts: 0 });
      n++;
    }
    return n;
  }
  async existingKeys(crawlId: string, keys: string[]) {
    const set = new Set(keys);
    return new Set(this.pages.filter((p) => p.crawl_id === crawlId && set.has(p.url_key)).map((p) => p.url_key));
  }
  async pathCounts(crawlId: string, pathKeys: string[]) {
    const m = new Map<string, number>();
    for (const k of pathKeys) m.set(k, this.pages.filter((p) => p.crawl_id === crawlId && p.path_key === k).length);
    return m;
  }
  async takePending(crawlId: string, limit: number) {
    const now = this.now();
    return this.pages
      .filter((p) => p.crawl_id === crawlId && p.status === "pending" && (!p.next_attempt_at || Date.parse(p.next_attempt_at) <= now))
      .sort((a, b) => a.priority - b.priority || a.depth - b.depth)
      .slice(0, limit)
      .map((p) => structuredClone(p));
  }
  async savePage(pageId: string, patch: PagePatch) { Object.assign(this.pages.find((p) => p.id === pageId)!, patch); }
  async loadPrevious(prevCrawlId: string, keys: string[]) {
    const set = new Set(keys);
    const out = new Map<string, PreviousPage>();
    for (const p of this.pages) {
      if (p.crawl_id !== prevCrawlId || !set.has(p.url_key)) continue;
      out.set(p.url_key, {
        url_key: p.url_key, status: p.status, etag: p.etag ?? null, last_modified: p.last_modified ?? null, http_status: p.http_status ?? null,
        final_url: p.final_url ?? null, fetched_via: p.fetched_via ?? null, content_type: p.content_type ?? null, title: p.title ?? null,
        signals: p.signals ?? null, links: p.links ?? null, content_text: p.content_text ?? null, fetched_at: p.fetched_at ?? null,
      });
    }
    return out;
  }
}
