// The crawler's network layer. Every request and every redirect hop is checked
// against the SSRF rules, bodies are size-capped, and only HTML is read.
import type { FetchResult } from "./types.ts";
import { checkResolvedSafe, checkUrlSafe } from "./ssrf.ts";

export const CRAWLER_UA = "OrangeDoorSEOBot/1.0 (+https://orangedoormarketing.com/bot)";
const MAX_BYTES = 2_000_000;
const MAX_HOPS = 5;
const TIMEOUT_MS = 12_000;

/** Best-effort DNS check. If the runtime has no resolver, the literal-host checks still apply. */
async function resolvesPublic(host: string): Promise<string | null> {
  try {
    const [a, aaaa] = await Promise.all([
      Deno.resolveDns(host, "A").catch(() => [] as string[]),
      Deno.resolveDns(host, "AAAA").catch(() => [] as string[]),
    ]);
    const addrs = [...a, ...aaaa];
    if (!addrs.length) return null; // unresolved here: let fetch fail naturally rather than guess
    const verdict = checkResolvedSafe(addrs);
    return verdict.ok ? null : verdict.reason;
  } catch {
    return null; // resolver unavailable in this runtime
  }
}

async function readCapped(res: Response, max: number): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) return { text: "", truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { chunks.push(value.slice(0, value.byteLength - (size - max))); truncated = true; await reader.cancel().catch(() => {}); break; }
    chunks.push(value);
  }
  const buf = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.byteLength; }
  return { text: new TextDecoder().decode(buf), truncated };
}

export async function safeFetch(url: string, opts: { timeoutMs?: number; maxBytes?: number; wantBody?: boolean; etag?: string | null; lastModified?: string | null } = {}): Promise<FetchResult> {
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? MAX_BYTES;
  let cur = url;
  const empty = (over: Partial<FetchResult>): FetchResult => ({ ok: false, status: 0, finalUrl: cur, hops: 0, contentType: "", html: "", truncated: false, headers: { xRobotsTag: "" }, ...over });

  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const verdict = checkUrlSafe(cur);
    if (!verdict.ok) return empty({ blocked: verdict.reason, error: verdict.reason, hops: hop });
    const dnsProblem = await resolvesPublic(new URL(cur).hostname);
    if (dnsProblem) return empty({ blocked: dnsProblem, error: dnsProblem, hops: hop });

    let res: Response;
    try {
      res = await fetch(cur, {
        headers: {
          "User-Agent": CRAWLER_UA, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          // Conditional request: only for the URL we already have, never after a redirect hop.
          ...(hop === 0 && opts.etag ? { "If-None-Match": opts.etag } : {}),
          ...(hop === 0 && opts.lastModified && !opts.etag ? { "If-Modified-Since": opts.lastModified } : {}),
        },
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      return empty({ error: e instanceof Error ? e.message : "network error", hops: hop });
    }

    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      res.body?.cancel().catch(() => {});
      try { cur = new URL(loc, cur).toString(); } catch { return empty({ status: res.status, error: "bad redirect target", hops: hop }); }
      continue;
    }

    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    const xRobotsTag = res.headers.get("x-robots-tag") ?? "";
    const etag = res.headers.get("etag") ?? undefined;
    const lastModified = res.headers.get("last-modified") ?? undefined;
    if (res.status === 304) {
      res.body?.cancel().catch(() => {});
      return { ok: true, status: 304, finalUrl: cur, hops: hop, contentType, html: "", truncated: false, headers: { xRobotsTag, etag, lastModified } };
    }
    const isHtml = /text\/html|application\/xhtml/.test(contentType) || contentType === "";
    if (!res.ok || !isHtml || opts.wantBody === false) {
      res.body?.cancel().catch(() => {});
      return { ok: res.ok, status: res.status, finalUrl: cur, hops: hop, contentType, html: "", truncated: false, headers: { xRobotsTag, etag, lastModified } };
    }
    const { text, truncated } = await readCapped(res, maxBytes);
    return { ok: true, status: res.status, finalUrl: cur, hops: hop, contentType, html: text, truncated, headers: { xRobotsTag, etag, lastModified } };
  }
  return empty({ status: 310, error: "too many redirects", hops: MAX_HOPS });
}

/** Plain-text fetch for robots.txt and sitemaps (XML counts as text here). */
export async function fetchTextSafe(url: string, maxBytes = 5_000_000): Promise<string | null> {
  const verdict = checkUrlSafe(url);
  if (!verdict.ok) return null;
  let cur = url;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (!checkUrlSafe(cur).ok) return null;
    if (await resolvesPublic(new URL(cur).hostname)) return null;
    let res: Response;
    try { res = await fetch(cur, { headers: { "User-Agent": CRAWLER_UA }, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) }); } catch { return null; }
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      res.body?.cancel().catch(() => {});
      try { cur = new URL(loc, cur).toString(); } catch { return null; }
      continue;
    }
    if (!res.ok) { res.body?.cancel().catch(() => {}); return null; }
    return (await readCapped(res, maxBytes)).text;
  }
  return null;
}
