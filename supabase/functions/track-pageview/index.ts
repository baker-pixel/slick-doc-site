import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getClientIp } from "../_shared/rateLimit.ts";
import {
  isBotUserAgent,
  localDay,
  MAX_BODY_BYTES,
  originMatchesSite,
  parsePageview,
  referrerHost,
  visitorHash,
  WindowCounter,
} from "../_shared/trafficIngest.ts";

// Public beacon endpoint for the WordPress plugin's footer script (v1.3.0+).
// No JWT: it's called from strangers' browsers. It is gated by the site's
// public tracking_key, the request's Origin matching that site, a bot filter,
// and per-site / per-visitor caps. Anything that fails a check is dropped
// silently -- the response is ALWAYS 204 so the endpoint reveals nothing about
// which keys exist or why a request was refused.
//
// Stored per pageview: path (query stripped), referrer host, utm_*, device,
// and an anonymous per-day visitor hash. The IP and user agent are only inputs
// to that hash and are never written anywhere.
//
// Needs the TRACKING_SALT secret. Without it nothing is recorded (fail closed):
// hashing with an empty salt would make the visitor hashes guessable.

const NO_CONTENT = () =>
  new Response(null, {
    status: 204,
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
  });

interface SiteRow {
  id: string;
  site_url: string;
  status: string;
  timezone: string | null;
  tracking_enabled: boolean;
}

// Key -> site lookups are cached briefly: a busy site would otherwise cost one
// extra query per pageview. A disconnect/disable takes effect within the TTL.
const SITE_TTL_MS = 60_000;
const siteCache = new Map<string, { site: SiteRow | null; at: number }>();

// ~50 pageviews/second per site per instance, and 120/min per visitor: bounds a
// runaway loop or a spoofing script without affecting real traffic.
const perSite = new WindowCounter(3000, 60_000);
const perVisitor = new WindowCounter(120, 60_000);

// deno-lint-ignore no-explicit-any
async function lookupSite(supabase: any, key: string): Promise<SiteRow | null> {
  const hit = siteCache.get(key);
  if (hit && Date.now() - hit.at < SITE_TTL_MS) return hit.site;
  const { data, error } = await supabase
    .from("connected_sites")
    .select("id, site_url, status, timezone, tracking_enabled")
    .eq("tracking_key", key)
    .maybeSingle();
  if (error) {
    console.error("track-pageview site lookup failed:", error.message);
    return null; // don't cache a failure
  }
  if (siteCache.size > 2000) siteCache.clear();
  siteCache.set(key, { site: (data as SiteRow | null) ?? null, at: Date.now() });
  return (data as SiteRow | null) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
      },
    });
  }
  if (req.method !== "POST") return NO_CONTENT();

  try {
    const salt = Deno.env.get("TRACKING_SALT");
    if (!salt) {
      console.error("track-pageview: TRACKING_SALT is not set; dropping event");
      return NO_CONTENT();
    }

    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) return NO_CONTENT();
    const pv = parsePageview(await req.text());
    if (!pv) return NO_CONTENT();

    const ua = req.headers.get("user-agent");
    if (isBotUserAgent(ua)) return NO_CONTENT();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const site = await lookupSite(supabase, pv.key);
    if (!site || site.status !== "connected" || !site.tracking_enabled) return NO_CONTENT();

    if (!originMatchesSite(req.headers.get("origin"), req.headers.get("referer"), site.site_url)) {
      return NO_CONTENT();
    }
    if (!perSite.hit(site.id)) return NO_CONTENT();

    const hash = await visitorHash(salt, site.id, localDay(site.timezone), getClientIp(req), ua!);
    if (!perVisitor.hit(`${site.id}:${hash}`)) return NO_CONTENT();

    const { error } = await supabase.from("site_events").insert({
      site_id: site.id,
      event: "pageview",
      path: pv.path,
      referrer_host: referrerHost(pv.referrer, site.site_url),
      utm_source: pv.utmSource,
      utm_medium: pv.utmMedium,
      utm_campaign: pv.utmCampaign,
      device: pv.device,
      visitor_hash: hash,
    });
    if (error) console.error("track-pageview insert failed:", error.message);
  } catch (e) {
    console.error("track-pageview error:", e instanceof Error ? e.message : e);
  }
  return NO_CONTENT();
});
