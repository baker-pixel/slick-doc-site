// The resumable crawl engine. One call to crawlStep() does as much work as its time
// budget allows, saves everything, and returns -- the worker simply calls it again on
// the next tick, so a crawl can take minutes or hours and survives restarts.
// All I/O goes through CrawlStore and CrawlDeps, so the whole thing is tested with
// an in-memory store and a fake website.
import { contentSample, parseOnPage } from "../seoSignals.ts";
import { fetchableUrl, isTrap, pageTypeOf, pathOnly, urlKey, crawlPriority, sameSite } from "./urlRules.ts";
import { parseRobots, robotsAllows, robotsBlocksEverything, type RobotsRules } from "./robots.ts";
import { walkSitemaps } from "./sitemaps.ts";
import { DEFAULT_TUNING, type CrawlDeps, type CrawlRow, type CrawlStore, type CrawlTuning, type NewPage, type PagePatch, type PageRow, type PageSource } from "./types.ts";

export interface StepSummary {
  status: CrawlRow["status"];
  processed: number;
  pending: number;
  note?: string;
}

const MAX_CRAWL_DELAY_MS = 10_000;

function pathAndQuery(u: string): string {
  try { const x = new URL(u); return x.pathname + x.search; } catch { return "/"; }
}

/** Turns discovered URLs into insertable rows: same site, crawlable, not a trap, allowed by robots, new, within the page cap. */
async function admitUrls(
  store: CrawlStore, crawl: CrawlRow, robots: RobotsRules | null, tuning: CrawlTuning,
  found: { url: string; base: string; depth: number; source: PageSource }[],
  capacityLeft: number,
): Promise<NewPage[]> {
  if (capacityLeft <= 0 || !found.length) return [];
  const byKey = new Map<string, NewPage>();
  for (const f of found) {
    const url = fetchableUrl(f.url, f.base);
    if (!url) continue;
    const key = urlKey(url);
    if (!key || byKey.has(key)) continue;
    if (!sameSite(crawl.origin, url) || isTrap(url)) continue;
    if (!robotsAllows(robots, pathAndQuery(url))) continue;
    const type = pageTypeOf(url);
    byKey.set(key, {
      crawl_id: crawl.id, client_account_id: crawl.client_account_id, url, url_key: key, path_key: pathOnly(url),
      depth: f.depth, source: f.source, page_type: type, priority: crawlPriority(type, f.depth, f.source),
    });
  }
  if (!byKey.size) return [];

  const known = await store.existingKeys(crawl.id, [...byKey.keys()]);
  const fresh = [...byKey.values()].filter((p) => !known.has(p.url_key));
  if (!fresh.length) return [];

  // Cap ?param variants of one page (filters, sort orders) so they can't eat the crawl.
  const counts = await store.pathCounts(crawl.id, [...new Set(fresh.map((p) => p.path_key))]);
  const accepted = new Map<string, number>();
  const admitted: NewPage[] = [];
  for (const p of fresh.sort((a, b) => a.priority - b.priority)) {
    const hasQuery = p.url_key.includes("?");
    const used = (counts.get(p.path_key) ?? 0) + (accepted.get(p.path_key) ?? 0);
    if (hasQuery && used >= tuning.maxVariantsPerPath) continue;
    accepted.set(p.path_key, (accepted.get(p.path_key) ?? 0) + 1);
    admitted.push(p);
    if (admitted.length >= capacityLeft) break;
  }
  return admitted;
}

async function seed(store: CrawlStore, deps: CrawlDeps, crawl: CrawlRow, tuning: CrawlTuning): Promise<{ ok: true; robots: RobotsRules | null } | { ok: false; reason: string }> {
  const home = await deps.fetchPage(crawl.origin + "/");
  if (home.blocked) return { ok: false, reason: `This address can't be crawled: ${home.blocked}.` };
  if (home.status === 0 || home.status >= 500) return { ok: false, reason: `The website could not be reached (${home.error ?? "HTTP " + home.status}).` };
  if (!sameSite(crawl.origin, home.finalUrl)) return { ok: false, reason: `The website redirects to a different domain (${new URL(home.finalUrl).hostname}). Update the website address to that domain.` };
  if (home.status === 401 || home.status === 403) return { ok: false, reason: `The website refused our crawler (HTTP ${home.status}). It may be behind a login or a bot-protection service.` };

  // Continue on the site's own preferred host (www vs non-www) so every later URL agrees with it.
  const origin = new URL(home.finalUrl).origin;
  const live: CrawlRow = { ...crawl, origin };

  const robotsText = await deps.fetchText(origin + "/robots.txt");
  const robots = robotsText ? parseRobots(robotsText) : null;
  if (robots && robotsBlocksEverything(robots)) return { ok: false, reason: "robots.txt tells crawlers to stay out of the whole site (Disallow: /). Google can't read it either." };

  const roots = [...new Set([...(robots?.sitemaps ?? []), origin + "/sitemap.xml", origin + "/sitemap_index.xml", origin + "/wp-sitemap.xml"])];
  const walk = await walkSitemaps(roots, { fetchText: deps.fetchText, maxUrls: Math.max(500, crawl.max_pages * 3) });

  const found = [
    { url: origin + "/", base: origin, depth: 0, source: "seed" as PageSource },
    ...walk.entries.map((e) => ({ url: e.loc, base: origin, depth: 1, source: "sitemap" as PageSource })),
  ];
  const rows = await admitUrls(store, live, robots, tuning, found, crawl.max_pages);
  if (!rows.some((r) => r.depth === 0)) {
    // The homepage must always be in: it is the crawl's entry point for link discovery.
    const key = urlKey(origin + "/")!;
    rows.unshift({ crawl_id: crawl.id, client_account_id: crawl.client_account_id, url: origin + "/", url_key: key, path_key: pathOnly(origin + "/"), depth: 0, source: "seed", page_type: "home", priority: 0 });
  }
  const inserted = await store.insertPages(rows);

  await store.patchCrawl(crawl.id, {
    origin, phase: "crawl", pages_discovered: inserted,
    config: {
      ...crawl.config,
      robots: robots ? { rules: robots.rules, crawlDelaySeconds: robots.crawlDelaySeconds, sitemaps: robots.sitemaps, unparseable: robots.unparseable } : undefined,
      sitemapUrlsFound: walk.entries.length, sitemapsRead: walk.sitemapsRead, sitemapsSkipped: walk.sitemapsSkipped, sitemapTruncated: walk.truncated,
    },
  });
  return { ok: true, robots };
}

export async function crawlStep(
  store: CrawlStore, deps: CrawlDeps, crawlId: string,
  opts: { deadline: number; tuning?: Partial<CrawlTuning> },
): Promise<StepSummary> {
  const tuning: CrawlTuning = { ...DEFAULT_TUNING, ...opts.tuning };
  let crawl = await store.loadCrawl(crawlId);
  if (crawl.status === "complete" || crawl.status === "failed" || crawl.status === "cancelled") {
    return { status: crawl.status, processed: 0, pending: 0, note: "already finished" };
  }

  const nowIso = () => new Date(deps.now()).toISOString();
  if (crawl.status === "queued" || !crawl.started_at) await store.patchCrawl(crawlId, { status: "running", started_at: crawl.started_at ?? nowIso() });

  const startedAt = crawl.started_at ? Date.parse(crawl.started_at) : deps.now();
  if (deps.now() - startedAt > tuning.maxCrawlMs) {
    await store.patchCrawl(crawlId, { status: "failed", error: "The crawl ran for too long and was stopped. Try again, or ask us to review the site.", finished_at: nowIso() });
    return { status: "failed", processed: 0, pending: 0, note: "timed out" };
  }

  let robots: RobotsRules | null = null;
  if (crawl.phase === "seed") {
    const s = await seed(store, deps, crawl, tuning);
    if (!s.ok) {
      await store.patchCrawl(crawlId, { status: "failed", error: s.reason, finished_at: nowIso(), phase: "done" });
      return { status: "failed", processed: 0, pending: 0, note: s.reason };
    }
    robots = s.robots;
    crawl = await store.loadCrawl(crawlId);
  } else if (crawl.config.robots) {
    robots = { ...crawl.config.robots, unparseable: crawl.config.robots.unparseable };
  }

  const delayMs = Math.min(MAX_CRAWL_DELAY_MS, Math.max(tuning.minDelayMs, (robots?.crawlDelaySeconds ?? 0) * 1000));
  let renders = crawl.config.renders ?? 0;
  let processed = 0;
  let lastStart = 0;

  while (deps.now() < opts.deadline) {
    const fresh = await store.loadCrawl(crawlId);
    if (fresh.status === "cancelled") return { status: "cancelled", processed, pending: 0 };
    const batch = await store.takePending(crawlId, tuning.batchSize);
    if (!batch.length) break;

    const discoveries: { url: string; base: string; depth: number; source: PageSource }[] = [];
    let next = 0;
    const worker = async () => {
      while (next < batch.length && deps.now() < opts.deadline) {
        const page = batch[next++];
        const wait = lastStart + delayMs - deps.now();
        if (wait > 0) { lastStart += delayMs; await deps.sleep(wait); } else lastStart = deps.now();
        await processPage(page);
        processed++;
      }
    };

    const processPage = async (page: PageRow) => {
      let patch: PagePatch;
      try {
        const res = await deps.fetchPage(page.url);
        const attempts = page.attempts + 1;
        const retryable = !res.blocked && (res.status === 0 || res.status >= 500 || res.status === 429);

        if (res.blocked) {
          patch = { status: "failed", attempts, error: res.blocked, fetched_at: nowIso() };
        } else if (retryable) {
          patch = attempts >= tuning.maxAttempts
            ? { status: "failed", attempts, http_status: res.status || null, error: res.error ?? `HTTP ${res.status}`, fetched_at: nowIso() }
            : { attempts, next_attempt_at: new Date(deps.now() + tuning.backoffMs * attempts).toISOString(), error: res.error ?? `HTTP ${res.status}` };
        } else if (res.status >= 400) {
          patch = { status: "done", attempts, http_status: res.status, final_url: res.finalUrl, error: null, signals: null, fetched_at: nowIso() };
        } else {
          const finalKey = urlKey(res.finalUrl);
          if (finalKey && finalKey !== page.url_key) {
            // Redirected to a different page: record it, and crawl the target under its own row.
            if (sameSite(crawl.origin, res.finalUrl)) {
              discoveries.push({ url: res.finalUrl, base: page.url, depth: page.depth, source: "link" });
              patch = { status: "done", attempts, http_status: res.status, final_url: res.finalUrl, signals: { redirected_to: res.finalUrl, hops: res.hops }, fetched_at: nowIso() };
            } else {
              patch = { status: "skipped", attempts, http_status: res.status, final_url: res.finalUrl, error: "redirects to another domain", fetched_at: nowIso() };
            }
          } else if (!res.html) {
            patch = { status: "done", attempts, http_status: res.status, final_url: res.finalUrl, content_type: res.contentType, signals: null, fetched_at: nowIso() };
          } else {
            let html = res.html, via: "plain" | "render" = "plain";
            let parsed = parseOnPage(html, res.finalUrl);
            if (parsed.looks_like_empty_spa && deps.render && renders < tuning.maxRenders) {
              renders++;
              const rendered = await deps.render(res.finalUrl).catch(() => null);
              if (rendered) { html = rendered; via = "render"; parsed = parseOnPage(html, res.finalUrl); }
            }
            const { internal_link_urls, content_sample: _cs, text_sample: _ts, ...signals } = parsed;
            const linkKeys: string[] = [];
            for (const l of internal_link_urls ?? []) {
              const k = urlKey(l);
              if (k && !linkKeys.includes(k)) linkKeys.push(k);
              discoveries.push({ url: l, base: res.finalUrl, depth: page.depth + 1, source: "link" });
            }
            patch = {
              status: "done", attempts, http_status: res.status, final_url: res.finalUrl, fetched_via: via, content_type: res.contentType,
              signals: { ...signals, noindex: signals.noindex || /noindex/i.test(res.headers.xRobotsTag), x_robots_tag: res.headers.xRobotsTag, redirect_hops: res.hops, body_truncated: res.truncated },
              links: linkKeys, title: parsed.title || null, content_text: contentSample(html, 6000), error: null, fetched_at: nowIso(),
            };
          }
        }
      } catch (e) {
        // A bug or odd page must never kill the whole crawl: record and move on.
        const attempts = page.attempts + 1;
        patch = attempts >= tuning.maxAttempts
          ? { status: "failed", attempts, error: `internal error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300), fetched_at: nowIso() }
          : { attempts, next_attempt_at: new Date(deps.now() + tuning.backoffMs * attempts).toISOString(), error: String(e instanceof Error ? e.message : e).slice(0, 300) };
      }
      await store.savePage(page.id, patch);
    };

    await Promise.all(Array.from({ length: Math.min(tuning.concurrency, batch.length) }, worker));

    // Discovery once per batch: dedupe, apply the page cap and variant cap in one place.
    const counts = await store.counts(crawlId);
    const admitted = await admitUrls(store, crawl, robots, tuning, discoveries, crawl.max_pages - counts.total);
    if (admitted.length) await store.insertPages(admitted);
    const after = await store.counts(crawlId);
    await store.patchCrawl(crawlId, { pages_discovered: after.total, pages_crawled: after.done, pages_failed: after.failed, last_step_at: nowIso(), config: { ...crawl.config, renders } });
  }

  const counts = await store.counts(crawlId);
  await store.patchCrawl(crawlId, { pages_discovered: counts.total, pages_crawled: counts.done, pages_failed: counts.failed, last_step_at: nowIso(), config: { ...crawl.config, renders } });

  if (counts.pending === 0) {
    if (counts.done === 0 && counts.failed > 0) {
      await store.patchCrawl(crawlId, { status: "failed", phase: "done", finished_at: nowIso(), error: "None of the pages could be fetched. The site may be down or blocking our crawler." });
      return { status: "failed", processed, pending: 0 };
    }
    await store.patchCrawl(crawlId, { status: "complete", phase: "done", finished_at: nowIso(), error: null });
    return { status: "complete", processed, pending: 0 };
  }
  return { status: "running", processed, pending: counts.pending };
}
