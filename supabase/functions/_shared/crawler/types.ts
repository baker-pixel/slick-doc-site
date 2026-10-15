// Shapes shared by the crawl engine, its store and the edge functions.

export type CrawlStatus = "queued" | "running" | "complete" | "failed" | "cancelled";
export type PageStatus = "pending" | "done" | "failed" | "skipped";
export type PageSource = "seed" | "sitemap" | "link";

export interface CrawlConfig {
  robots?: { rules: { allow: boolean; pattern: string }[]; crawlDelaySeconds: number | null; sitemaps: string[]; unparseable: boolean };
  sitemapUrlsFound?: number;
  sitemapsRead?: string[];
  sitemapsSkipped?: string[];
  sitemapTruncated?: boolean;
  renders?: number;
  [k: string]: unknown;
}

export interface CrawlRow {
  id: string;
  client_account_id: string;
  origin: string;
  max_pages: number;
  status: CrawlStatus;
  phase: "seed" | "crawl" | "done";
  trigger: string;
  pages_discovered: number;
  pages_crawled: number;
  pages_failed: number;
  error: string | null;
  config: CrawlConfig;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  last_step_at: string | null;
}

export interface PageRow {
  id: string;
  crawl_id: string;
  url: string;
  url_key: string;
  path_key: string;
  depth: number;
  source: PageSource;
  page_type: string;
  priority: number;
  status: PageStatus;
  attempts: number;
}

export type NewPage = Omit<PageRow, "id" | "status" | "attempts"> & { client_account_id: string };

export interface PagePatch {
  status?: PageStatus;
  attempts?: number;
  next_attempt_at?: string | null;
  http_status?: number | null;
  final_url?: string | null;
  fetched_via?: "plain" | "render" | null;
  content_type?: string | null;
  error?: string | null;
  signals?: Record<string, unknown> | null;
  links?: string[] | null;
  title?: string | null;
  content_text?: string | null;
  fetched_at?: string | null;
}

export interface PageCounts { total: number; pending: number; done: number; failed: number; skipped: number }

/** Persistence the engine needs. Implemented over Supabase in production and in memory in tests. */
export interface CrawlStore {
  loadCrawl(id: string): Promise<CrawlRow>;
  patchCrawl(id: string, patch: Partial<Omit<CrawlRow, "id">>): Promise<void>;
  counts(crawlId: string): Promise<PageCounts>;
  /** Inserts pages whose url_key is new for this crawl; returns how many were actually inserted. */
  insertPages(rows: NewPage[]): Promise<number>;
  existingKeys(crawlId: string, keys: string[]): Promise<Set<string>>;
  /** How many pages already exist per path_key (caps ?param variants of one page). */
  pathCounts(crawlId: string, pathKeys: string[]): Promise<Map<string, number>>;
  /** Pending pages due now (next_attempt_at passed), best priority first. */
  takePending(crawlId: string, limit: number): Promise<PageRow[]>;
  savePage(pageId: string, patch: PagePatch): Promise<void>;
}

export interface FetchResult {
  ok: boolean;
  status: number;            // 0 = network error / timeout / blocked before request
  finalUrl: string;
  hops: number;
  contentType: string;
  html: string;              // "" unless an HTML response
  truncated: boolean;
  error?: string;
  blocked?: string;          // SSRF / policy refusal: never retried
  headers: { xRobotsTag: string };
}

export interface CrawlDeps {
  fetchPage(url: string): Promise<FetchResult>;
  fetchText(url: string): Promise<string | null>;
  /** Optional JavaScript renderer, used only for pages that look empty without it. */
  render?(url: string): Promise<string | null>;
  now(): number;
  sleep(ms: number): Promise<void>;
}

export interface CrawlTuning {
  concurrency: number;
  batchSize: number;
  /** Minimum gap between request starts, ms (raised by robots Crawl-delay). */
  minDelayMs: number;
  maxAttempts: number;
  /** Retry back-off per attempt, ms. */
  backoffMs: number;
  maxVariantsPerPath: number;
  maxRenders: number;
  /** A crawl still unfinished after this long is failed, not left running forever. */
  maxCrawlMs: number;
}

export const DEFAULT_TUNING: CrawlTuning = {
  concurrency: 4,
  batchSize: 20,
  minDelayMs: 250,
  maxAttempts: 3,
  backoffMs: 60_000,
  maxVariantsPerPath: 4,
  maxRenders: 60,
  maxCrawlMs: 12 * 60 * 60 * 1000,
};
