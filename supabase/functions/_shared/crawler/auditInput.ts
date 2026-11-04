// Turns a finished crawl (rows in site_pages) into what the audit needs: page signals,
// a link graph (broken links and orphan pages come from it, not from probing), and a
// ranking of which pages matter most (for PageSpeed sampling and AI-drafted fixes).
// Pure: no network, so all of it is unit-tested.
import type { PageSignals } from "../seoSignals.ts";
import { urlKey } from "./urlRules.ts";

export interface AuditPageRow {
  url: string;
  url_key: string;
  source: "seed" | "sitemap" | "link";
  page_type: string;
  status: "pending" | "done" | "failed" | "skipped";
  http_status: number | null;
  final_url: string | null;
  fetched_via: "plain" | "render" | null;
  depth: number;
  signals: Record<string, unknown> | null;
  links: string[] | null;
  text_sample: string | null;
}

const bool = (v: unknown) => v === true;
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);

export const isRedirectRow = (r: AuditPageRow) => !!r.signals && "redirected_to" in r.signals;
const isHtmlOk = (r: AuditPageRow) => r.status === "done" && (r.http_status ?? 0) > 0 && (r.http_status ?? 0) < 400 && !!r.signals && !isRedirectRow(r);
/** Definitive page errors only; a timeout or bot block says nothing about the page. */
export const isBrokenStatus = (s: number | null) => s === 404 || s === 410 || (s !== null && s >= 500 && s < 600);

export function toPageSignals(r: AuditPageRow): PageSignals {
  const g = r.signals ?? {};
  const url = r.final_url ?? r.url;
  const text = r.text_sample ?? "";
  return {
    url, reachable: true, fetched_via: r.fetched_via ?? "plain", status_code: r.http_status,
    title: str(g.title), meta_description: str(g.meta_description), h1_count: num(g.h1_count), word_count: num(g.word_count),
    image_count: num(g.image_count), images_missing_alt: num(g.images_missing_alt), internal_links: num(g.internal_links), external_links: num(g.external_links),
    has_viewport: bool(g.has_viewport), has_canonical: bool(g.has_canonical), has_schema: bool(g.has_schema),
    has_entity_schema: bool(g.has_entity_schema), has_faq_schema: bool(g.has_faq_schema),
    qa_pairs: Array.isArray(g.qa_pairs) ? (g.qa_pairs as { question: string; answer: string }[]) : [],
    has_open_graph: bool(g.has_open_graph), looks_like_empty_spa: bool(g.looks_like_empty_spa),
    text_sample: text, content_sample: text.slice(0, 1200), performance: null,
    probe_status: r.http_status, final_url: url, redirect_hops: num(g.redirect_hops), redirect_loop: false,
    x_robots_tag: str(g.x_robots_tag), noindex: bool(g.noindex), canonical_href: typeof g.canonical_href === "string" ? g.canonical_href : null,
    mixed_content_count: num(g.mixed_content_count), h1_text: str(g.h1_text),
    page_type: r.page_type, in_sitemap: r.source === "sitemap",
  };
}

/** A crawled URL that answered with a definitive error: kept so the audit can report it. */
function errorSignals(r: AuditPageRow): PageSignals {
  return {
    url: r.final_url ?? r.url, reachable: false, fetched_via: r.fetched_via ?? "plain", status_code: r.http_status,
    title: "", meta_description: "", h1_count: 0, word_count: 0, image_count: 0, images_missing_alt: 0, internal_links: 0, external_links: 0,
    has_viewport: false, has_canonical: false, has_schema: false, has_entity_schema: false, has_faq_schema: false, qa_pairs: [],
    has_open_graph: false, looks_like_empty_spa: false, text_sample: "", performance: null,
    probe_status: r.http_status, page_type: r.page_type, in_sitemap: r.source === "sitemap",
  };
}

// How much a page matters, by type. Used to pick PageSpeed samples and which pages get AI-drafted fixes.
const TYPE_WEIGHT: Record<string, number> = { home: 100, service: 80, product: 75, pricing: 75, contact: 70, about: 60, location: 60, faq: 50, other: 40, blog: 30, legal: 10 };

export interface LinkAnalysis {
  /** inbound link count per page key (redirects resolved to their targets) */
  inbound: Map<string, number>;
  broken: { url: string; status: number; found_on: string[] }[];
  orphans: string[];
  linksChecked: number;
}

export function analyzeLinks(rows: AuditPageRow[], opts: { truncated: boolean }): LinkAnalysis {
  const byKey = new Map(rows.map((r) => [r.url_key, r]));
  const resolve = (key: string): string => {
    const r = byKey.get(key);
    if (r && isRedirectRow(r)) {
      const to = urlKey(String(r.signals!.redirected_to));
      if (to && to !== key) return to;
    }
    return key;
  };

  const inbound = new Map<string, number>();
  const brokenMap = new Map<string, { url: string; status: number; found_on: Set<string> }>();
  const checked = new Set<string>();
  for (const r of rows) {
    if (!isHtmlOk(r)) continue;
    const from = r.final_url ?? r.url;
    for (const raw of new Set(r.links ?? [])) {
      const key = resolve(raw);
      if (key === r.url_key) continue;
      inbound.set(key, (inbound.get(key) ?? 0) + 1);
      const target = byKey.get(raw);
      if (!target) continue;
      checked.add(raw);
      if (target.status === "done" && isBrokenStatus(target.http_status)) {
        const e = brokenMap.get(raw) ?? { url: target.url, status: target.http_status!, found_on: new Set<string>() };
        e.found_on.add(from);
        brokenMap.set(raw, e);
      }
    }
  }

  // Orphans: listed in the sitemap but nothing on the site links to them. Only meaningful when the
  // crawl read the whole site and kept every link; a capped crawl (or a page with a huge link list) can't
  // tell "nobody links here" from "not read yet".
  const linkListsComplete = !rows.some((r) => isHtmlOk(r) && r.signals?.internal_links_capped === true);
  const orphans = opts.truncated || !linkListsComplete ? [] : rows
    .filter((r) => isHtmlOk(r) && r.source === "sitemap" && r.page_type !== "home" && !(r.signals?.noindex === true) && (inbound.get(r.url_key) ?? 0) === 0)
    .map((r) => r.final_url ?? r.url);

  return {
    inbound,
    broken: [...brokenMap.values()].map((b) => ({ url: b.url, status: b.status, found_on: [...b.found_on].slice(0, 5) })).sort((a, b) => b.found_on.length - a.found_on.length),
    orphans,
    linksChecked: checked.size,
  };
}

export interface AuditInput {
  signals: PageSignals[];
  links: LinkAnalysis;
  /** page url -> importance score (higher = matters more) */
  importance: Map<string, number>;
  /** the most important readable pages, best first (PageSpeed samples) */
  top: string[];
  skipped: { failed: number; nonHtml: number; redirects: number };
}

export function buildAuditInput(rows: AuditPageRow[], opts: { truncated: boolean }): AuditInput {
  const signals: PageSignals[] = [];
  const skipped = { failed: 0, nonHtml: 0, redirects: 0 };
  for (const r of rows) {
    if (isHtmlOk(r)) signals.push(toPageSignals(r));
    else if (r.status === "done" && isBrokenStatus(r.http_status)) signals.push(errorSignals(r));
    else if (r.status === "done" && isRedirectRow(r)) skipped.redirects++;
    else if (r.status === "done") skipped.nonHtml++;
    else if (r.status === "failed") skipped.failed++;
  }
  const links = analyzeLinks(rows, opts);
  const importance = new Map<string, number>();
  for (const r of rows) {
    if (!isHtmlOk(r)) continue;
    const inbound = links.inbound.get(r.url_key) ?? 0;
    const noindexPenalty = r.signals?.noindex === true ? 60 : 0;
    importance.set(r.final_url ?? r.url, (TYPE_WEIGHT[r.page_type] ?? 40) + Math.min(inbound, 30) - Math.min(r.depth, 5) * 2 - noindexPenalty);
  }
  const top = [...importance.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u);
  return { signals, links, importance, top, skipped };
}
