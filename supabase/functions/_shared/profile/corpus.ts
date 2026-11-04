// The crawl, shaped for the profile builder: readable pages with their text and facts, ranked by how
// much they say about the business. Pure.
import { urlKey } from "../crawler/urlRules.ts";
import { factsText, type PageFacts } from "./facts.ts";

export interface ProfileRow {
  url: string;
  url_key: string;
  source: string;
  page_type: string;
  status: string;
  http_status: number | null;
  final_url: string | null;
  depth: number;
  title: string | null;
  signals: Record<string, unknown> | null;
  links: string[] | null;
  content_text: string | null;
}

export interface ProfilePage {
  url: string;
  key: string;
  type: string;
  title: string;
  depth: number;
  inbound: number;
  importance: number;
  words: number;
  h1: string;
  headings: string[];
  facts: PageFacts | null;
  text: string;
}

export interface Corpus {
  pages: ProfilePage[];
  byKey: Map<string, ProfilePage>;
}

// What a page is likely to tell us about the business, by type. Blog posts say little about who the company is.
const TYPE_VALUE: Record<string, number> = { home: 100, about: 90, service: 85, product: 80, pricing: 70, contact: 65, location: 65, faq: 60, other: 40, blog: 25, legal: 5 };

export function buildCorpus(rows: ProfileRow[]): Corpus {
  const usable = rows.filter((r) => r.status === "done" && (r.http_status ?? 0) > 0 && (r.http_status ?? 0) < 400 && r.signals && !("redirected_to" in r.signals) && r.signals.noindex !== true);
  const inbound = new Map<string, number>();
  for (const r of usable) for (const k of new Set(r.links ?? [])) if (k !== r.url_key) inbound.set(k, (inbound.get(k) ?? 0) + 1);

  const pages = usable.map((r): ProfilePage => {
    const facts = (r.signals!.facts as PageFacts | undefined) ?? null;
    const url = r.final_url ?? r.url;
    const n = inbound.get(r.url_key) ?? 0;
    return {
      url, key: urlKey(url) ?? r.url_key, type: r.page_type, title: r.title ?? "", depth: r.depth, inbound: n,
      importance: (TYPE_VALUE[r.page_type] ?? 40) + Math.min(n, 30) - Math.min(r.depth, 5) * 2,
      words: typeof r.signals!.word_count === "number" ? (r.signals!.word_count as number) : 0,
      h1: typeof r.signals!.h1_text === "string" ? (r.signals!.h1_text as string) : "",
      headings: (facts?.headings ?? []).map((h) => h.text), facts, text: r.content_text ?? "",
    };
  }).sort((a, b) => b.importance - a.importance);
  return { pages, byKey: new Map(pages.map((p) => [p.key, p])) };
}

/** Find a page by any spelling of its URL (trailing slash, www, tracking params). */
export function findPage(corpus: Corpus, url: string): ProfilePage | null {
  const key = urlKey(url);
  return key ? corpus.byKey.get(key) ?? null : null;
}

/** Everything on a page that evidence may quote: title, headings, structured facts, body text. */
export function pageQuoteText(p: ProfilePage): string {
  return [p.title, p.h1, p.headings.join("\n"), factsText(p.facts), p.text].filter(Boolean).join("\n");
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Fingerprint of what the site says about itself (its most telling pages). Same hash = nothing worth re-reading changed. */
export function contentHash(corpus: Corpus, top = 8): string {
  let h = 0x811c9dc5;
  for (const p of corpus.pages.slice(0, top)) {
    const s = `${p.key}|${norm(p.title)}|${norm(p.h1)}|${norm(p.text).slice(0, 1500)}`;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  }
  return h.toString(16).padStart(8, "0");
}
