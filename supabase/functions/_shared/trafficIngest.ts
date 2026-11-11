// Pure logic for track-pageview: what to accept from the plugin's footer
// script, and how to turn it into a stored row. No I/O here so it can be
// unit-tested; the edge function does the lookups and the insert.

export const MAX_BODY_BYTES = 2048;

export interface Pageview {
  key: string;
  path: string;
  referrer: string | null; // raw referrer string, resolved against the site later
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  device: "mobile" | "tablet" | "desktop" | null;
}

const KEY_RE = /^[a-f0-9]{32}$/;

// deno-lint-ignore no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

function clean(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(CONTROL_CHARS, "").trim().slice(0, max);
  return s || null;
}

/**
 * Validate the beacon body. Returns null for anything that isn't a well-formed
 * pageview (the caller silently drops those). Query strings and hashes are
 * stripped from the path on purpose: they routinely carry emails, tokens and
 * search terms, and we never want that stored.
 */
export function parsePageview(raw: string): Pageview | null {
  if (!raw || raw.length > MAX_BODY_BYTES) return null;
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    body = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  const key = typeof body.k === "string" ? body.k.toLowerCase() : "";
  if (!KEY_RE.test(key)) return null;

  const rawPath = clean(body.p, 600);
  if (!rawPath || !rawPath.startsWith("/") || rawPath.startsWith("//")) return null;
  const path = rawPath.split(/[?#]/)[0].slice(0, 512) || "/";

  const utm = (body.u && typeof body.u === "object" ? body.u : {}) as Record<string, unknown>;
  const device = body.d === "mobile" || body.d === "tablet" || body.d === "desktop" ? body.d : null;

  return {
    key,
    path,
    referrer: clean(body.r, 300),
    utmSource: clean(utm.s, 100),
    utmMedium: clean(utm.m, 100),
    utmCampaign: clean(utm.c, 100),
    device,
  };
}

/** Lowercase host without "www.". */
export function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

function hostOf(urlish: string): string | null {
  try {
    return normalizeHost(new URL(urlish).host);
  } catch {
    return null;
  }
}

/**
 * Does the request genuinely come from this site's pages? Browsers always send
 * Origin on a cross-origin POST, so a missing header means a non-browser
 * client and is rejected. This stops casual spoofing; it is not authentication
 * (a script can set any header), which is why per-site caps also exist.
 */
export function originMatchesSite(origin: string | null, referer: string | null, siteUrl: string): boolean {
  const siteHost = hostOf(siteUrl);
  if (!siteHost) return false;
  const seen = origin && origin !== "null" ? hostOf(origin) : referer ? hostOf(referer) : null;
  return seen !== null && seen === siteHost;
}

/** Referrer host for display ("google.com"), or null when empty, invalid, or the site itself. */
export function referrerHost(referrer: string | null, siteUrl: string): string | null {
  if (!referrer) return null;
  const host = hostOf(referrer);
  if (!host || host.length > 100) return null;
  if (host === hostOf(siteUrl)) return null;
  return host;
}

// Crawlers that run JavaScript (Googlebot does) would otherwise be counted as
// people. Matched on the user agent, which the browser sends, not on anything
// the page script can set.
const BOT_RE =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|preview|facebookexternalhit|embedly|whatsapp|curl\/|wget|python-requests|go-http-client|node-fetch|axios|java\//i;

export function isBotUserAgent(ua: string | null): boolean {
  if (!ua) return true; // real browsers always send one
  return BOT_RE.test(ua);
}

/** The site's current local date (YYYY-MM-DD). Falls back to UTC for an unknown zone. */
export function localDay(timeZone: string | null, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Anonymous per-day visitor id: sha256(salt | site | local day | ip | ua).
 * The day is in the hash, so the same person gets a different value tomorrow
 * and cannot be followed across days. The IP is only ever an input here and is
 * never stored.
 */
export async function visitorHash(
  salt: string,
  siteId: string,
  day: string,
  ip: string,
  userAgent: string,
): Promise<string> {
  const data = new TextEncoder().encode([salt, siteId, day, ip, userAgent].join("|"));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Fixed-window counter used to cap writes per key (per site, per visitor).
 * In-memory and per function instance, so the cap is approximate across
 * instances, which is fine: it bounds a runaway loop, it isn't billing.
 */
export class WindowCounter {
  private counts = new Map<string, { n: number; resetAt: number }>();
  constructor(private limit: number, private windowMs: number, private maxKeys = 5000) {}

  /** Records a hit and returns true while still under the limit. */
  hit(key: string, now: number = Date.now()): boolean {
    const cur = this.counts.get(key);
    if (!cur || now >= cur.resetAt) {
      if (this.counts.size >= this.maxKeys) this.sweep(now);
      this.counts.set(key, { n: 1, resetAt: now + this.windowMs });
      return true;
    }
    cur.n += 1;
    return cur.n <= this.limit;
  }

  private sweep(now: number) {
    for (const [k, v] of this.counts) if (now >= v.resetAt) this.counts.delete(k);
    // Still full (many live keys): drop everything rather than grow without bound.
    if (this.counts.size >= this.maxKeys) this.counts.clear();
  }
}
