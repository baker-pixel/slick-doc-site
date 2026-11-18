// Shared helpers for the WordPress plugin connection lifecycle
// (prepare-connection, connect-site, disconnect-site, scan-wordpress-site).
// The three connection functions each normalised site URLs slightly
// differently, so a client who typed "https://www.Site.com/wp-admin" never
// matched the plugin's get_site_url() of "https://site.com" -- the plugin's
// row landed with client_id = null and the portal waited forever.

const TIMEOUT_MS = 8_000;

/** Canonical form: lowercase scheme+host, no /wp-admin, no trailing slash, no query/hash. */
export function normalizeSiteUrl(raw: string): string {
  let s = (raw ?? "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    const path = u.pathname.replace(/\/wp-admin\/?.*$/i, "").replace(/\/+$/, "");
    return `${u.protocol}//${u.host}${path}`.toLowerCase();
  } catch {
    return "";
  }
}

/** http/https + www/non-www spellings of one site, for matching stored rows. */
export function siteUrlVariants(normalized: string): string[] {
  if (!normalized) return [];
  const m = normalized.match(/^https?:\/\/(?:www\.)?(.+)$/i);
  if (!m) return [normalized];
  const rest = m[1];
  return [`https://${rest}`, `https://www.${rest}`, `http://${rest}`, `http://www.${rest}`];
}

/** Rejects localhost / private / non-dotted hosts -- these URLs are fetched server-side. */
export function isPublicSiteUrl(normalized: string): boolean {
  try {
    const { hostname } = new URL(normalized);
    if (!hostname.includes(".") || hostname === "localhost") return false;
    if (/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(hostname)) return false;
    if (hostname.endsWith(".local") || hostname.endsWith(".internal")) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Proof of possession: does the WordPress install at siteUrl actually accept
 * this token? Only the real site can answer yes, so a stranger who merely
 * knows a client's public URL can't win a token swap -- but the real site,
 * whose plugin was reinstalled or restored and generated a fresh token, can.
 */
export async function pluginAcceptsToken(siteUrl: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`${siteUrl}/wp-json/orangedoor/v1/ping`, {
      headers: { "X-OD-Token": token },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return data?.status === "ok";
  } catch {
    return false;
  }
}

export interface PluginRemoval {
  reached: boolean;     // plugin answered at all (old plugins 404 on /disconnect)
  deactivated: boolean;
  removed: boolean;     // plugin files deleted from the site
}

/**
 * Best-effort: tell the plugin the connection was removed and ask it to
 * deactivate and delete itself. Needs the token, so call before clearing it.
 */
export async function removePluginFromSite(siteUrl: string, token: string): Promise<PluginRemoval> {
  const none: PluginRemoval = { reached: false, deactivated: false, removed: false };
  if (!siteUrl || !token) return none;
  try {
    const res = await fetch(`${siteUrl}/wp-json/orangedoor/v1/disconnect`, {
      method: "POST",
      headers: { "X-OD-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ remove_plugin: true }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return none;
    const data = await res.json().catch(() => ({}));
    return { reached: true, deactivated: !!data?.deactivated, removed: !!data?.removed };
  } catch {
    return none;
  }
}

/**
 * Refuse to write to a WordPress site the client disconnected. Disconnect
 * clears the plugin token, but Basic Auth credentials (a separate field)
 * would otherwise keep working. A client with no connected_sites row at all
 * (Basic-Auth-only) is unaffected. Returns an error message, or null if OK.
 */
// deno-lint-ignore no-explicit-any
export async function wpWriteBlockedReason(supabase: any, clientId: string): Promise<string | null> {
  const { data } = await supabase
    .from("connected_sites")
    .select("status")
    .eq("client_id", clientId)
    .maybeSingle();
  if (data?.status === "disconnected") {
    return "This client's WordPress site is disconnected. Reconnect it before applying fixes.";
  }
  return null;
}

/** Human-readable words from an upload filename, or null when it carries no meaning (IMG_4021, hashes, screenshots). */
export function filenameHint(filename: string): string | null {
  const base = (filename ?? "")
    .replace(/\.[^.]+$/, "")
    .replace(/-\d{2,5}x\d{2,5}$/i, "")   // WordPress size suffix
    .replace(/-scaled$/i, "");
  if (/^(img|dsc|dscn|pxl|image|photo|screenshot|screen[ -]shot|whatsapp|untitled|download|unnamed)[\s_-]*\d*/i.test(base) && !/[a-z]{4,}\s+[a-z]{4,}/i.test(base.replace(/[-_]/g, " ").replace(/^\w+\s/, ""))) return null;
  if (/^[0-9a-f]{8,}$/i.test(base)) return null;
  const words = base.replace(/[-_.]+/g, " ").replace(/\d+/g, " ").replace(/\s+/g, " ").trim();
  const real = words.split(" ").filter(w => w.length >= 3);
  return real.length >= 2 || words.length >= 10 ? words : null;
}
