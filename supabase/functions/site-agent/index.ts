// The one endpoint the WordPress plugin (v2+) talks to. The plugin always calls
// us -- we never need to reach into the client's site -- and signs every request
// with a private key that stays on the site (see _shared/wordpress/agentAuth.ts).
//
//   register   first contact: prove the site holds the key, link it to a client
//   heartbeat  "I'm alive": versions, SEO plugin, time; we answer with queue depth
//   pull       hand over queued changes (apply / revert)
//   report     what happened to each change; we then check the LIVE page
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logActivity } from "../_shared/core/activityLog.ts";
import {
  checkSignedRequest,
  readSignedHeaders,
  verifySignature,
} from "../_shared/wordpress/agentAuth.ts";
import { runInBackground } from "../_shared/core/background.ts";
import { MAX_ITEMS_PER_PART, MAX_PARTS, CHUNK_KINDS, validUploadId } from "../_shared/wordpress/inventory.ts";
import { fetchLiveHtml, verifyRenderedField } from "../_shared/wordpress/renderVerify.ts";
import {
  isPublicSiteUrl,
  normalizeSiteUrl,
  siteUrlVariants,
} from "../_shared/wordpress/wpSite.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-od-site, x-od-timestamp, x-od-nonce, x-od-signature",
};

// Signed instead of the real URL path: Supabase rewrites the path inside a function
// (/functions/v1/site-agent -> /site-agent), so the two sides would disagree.
const SIGNED_PATH = "/site-agent";
const POLL_SECONDS = 300;
const PULL_BATCH = 25;
const REDELIVER_AFTER_MS = 10 * 60_000; // plugin took it and never reported (crashed / request died)
const MAX_ATTEMPTS = 5;
const REVERIFY_BATCH = 5;
const REVERIFY_AFTER_MS = 3 * 60_000;

// deno-lint-ignore no-explicit-any
type Supabase = any;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function validTimezone(tz: unknown): string | null {
  if (typeof tz !== "string" || !tz || tz.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

const str = (v: unknown, max = 64): string | null => (typeof v === "string" && v ? v.slice(0, max) : null);

// ── register ───────────────────────────────────────────────────────────────
// Proof of possession: we send a random challenge to the site's own URL and
// the plugin must answer with a signature made by the key it is registering.
// Only the real site (which holds the private key) can do that, so knowing a
// client's public URL is not enough to claim it.
async function register(supabase: Supabase, body: Record<string, unknown>) {
  const publicKey = str(body.public_key, 128);
  const normalizedUrl = normalizeSiteUrl(String(body.site_url ?? ""));
  if (!publicKey || !normalizedUrl || !isPublicSiteUrl(normalizedUrl)) return json({ error: "site_url and public_key required" }, 400);

  const challenge = crypto.randomUUID().replace(/-/g, "");
  let signature: string | null = null;
  try {
    const res = await fetch(`${normalizedUrl}/wp-json/orangedoor/v1/challenge?c=${challenge}`, {
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });
    if (res.ok) signature = str((await res.json().catch(() => null))?.signature, 200);
  } catch { /* unreachable: reported below */ }
  if (!signature || !(await verifySignature(publicKey, signature, `od-register\n${challenge}`))) {
    return json({ error: "Could not confirm this site holds the key. Make sure the site is reachable and the plugin is active." }, 403);
  }

  const variants = siteUrlVariants(normalizedUrl);
  const { data: candidates } = await supabase.from("connected_sites").select("id, client_id, site_url").in("site_url", variants);
  const existing = candidates?.find((r: { site_url: string }) => r.site_url === normalizedUrl) ?? candidates?.[0] ?? null;

  let clientId: string | null = existing?.client_id ?? null;
  if (!clientId) {
    const { data: creds } = await supabase.from("client_credentials").select("client_id").in("wordpress_url", variants).limit(1).maybeSingle();
    clientId = creds?.client_id ?? null;
  }

  const plugins = Array.isArray(body.plugins) ? body.plugins.map(String) : [];
  const fields: Record<string, unknown> = {
    site_url: normalizedUrl,
    status: "connected",
    agent_mode: "agent",
    agent_public_key: publicKey,
    // The v1 shared token is retired the moment the site moves to the agent.
    token: "",
    yoast_active: plugins.includes("yoast-seo"),
    rankmath_active: plugins.includes("rank-math"),
    wp_version: str(body.wp_version),
    php_version: str(body.php_version),
    plugin_version: str(body.plugin_version) ?? "2.0.0",
    last_heartbeat_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (clientId) fields.client_id = clientId;
  const tz = validTimezone(body.timezone);
  if (tz) fields.timezone = tz;

  const q = existing
    ? supabase.from("connected_sites").update(fields).eq("id", existing.id)
    : supabase.from("connected_sites").upsert(fields, { onConflict: "site_url" });
  const { data: site, error } = await q.select("id, tracking_key, tracking_enabled").single();
  if (error || !site) throw new Error("Failed to register site: " + (error?.message ?? "unknown"));

  if (clientId) {
    // Keep the credentials row pointing at this site; the legacy token is gone.
    await supabase.from("client_credentials").upsert(
      { client_id: clientId, wordpress_url: normalizedUrl, wordpress_plugin_api_key: null },
      { onConflict: "client_id" },
    );
  }
  supabase.functions.invoke("scan-wordpress-site", { body: { site_id: site.id } }).catch(() => {});

  return json({
    status: "connected",
    site_id: site.id,
    linked_to_client: !!clientId,
    tracking_key: site.tracking_key,
    tracking_enabled: site.tracking_enabled,
    poll_seconds: POLL_SECONDS,
  });
}

// ── authenticated actions ──────────────────────────────────────────────────
async function authenticate(supabase: Supabase, req: Request, raw: string) {
  const h = readSignedHeaders(req.headers);
  if (!h.siteId || !/^[0-9a-f-]{36}$/i.test(h.siteId)) return { error: json({ error: "Unauthorized" }, 401) };
  const { data: site } = await supabase
    .from("connected_sites")
    .select("id, client_id, site_url, status, agent_mode, agent_public_key, scan_requested_at")
    .eq("id", h.siteId)
    .maybeSingle();
  if (!site || site.agent_mode !== "agent" || !site.agent_public_key) return { error: json({ error: "Unauthorized" }, 401) };

  const failure = await checkSignedRequest({
    method: req.method,
    path: SIGNED_PATH,
    body: raw,
    headers: h,
    publicKeyB64: site.agent_public_key,
  });
  if (failure) return { error: json({ error: "Unauthorized", reason: failure }, 401) };

  // Replay check: the primary key rejects a nonce we have already seen.
  const { error: replay } = await supabase.from("site_agent_nonces").insert({ site_id: site.id, nonce: h.nonce });
  if (replay) return { error: json({ error: "Unauthorized", reason: "replayed" }, 401) };

  // A disconnected site must stop being served even though its key is valid.
  if (site.status === "disconnected") return { error: json({ error: "disconnected", disconnected: true }, 410) };
  return { site };
}

async function heartbeat(supabase: Supabase, site: { id: string; status: string; scan_requested_at: string | null }, body: Record<string, unknown>) {
  const plugins = Array.isArray(body.plugins) ? body.plugins.map(String) : [];
  const update: Record<string, unknown> = {
    last_heartbeat_at: new Date().toISOString(),
    plugin_version: str(body.plugin_version) ?? undefined,
    wp_version: str(body.wp_version) ?? undefined,
    php_version: str(body.php_version) ?? undefined,
    yoast_active: plugins.includes("yoast-seo"),
    rankmath_active: plugins.includes("rank-math"),
    agent_info: { plugins, errors: Array.isArray(body.errors) ? body.errors.slice(0, 5).map((e) => String(e).slice(0, 300)) : [] },
  };
  // A site that was marked unreachable by a failed scan is clearly reachable now.
  if (site.status === "unreachable" || site.status === "pending") update.status = "connected";
  const tz = validTimezone(body.timezone);
  if (tz) update.timezone = tz;
  await supabase.from("connected_sites").update(update).eq("id", site.id);

  await reverifyStale(supabase, site.id);

  const { count } = await supabase
    .from("site_changes").select("id", { count: "exact", head: true })
    .eq("site_id", site.id).in("status", ["queued", "revert_queued"]);
  return json({ ok: true, server_time: Math.floor(Date.now() / 1000), pending_changes: count ?? 0, scan_requested: !!site.scan_requested_at, poll_seconds: POLL_SECONDS });
}

async function pull(supabase: Supabase, siteId: string) {
  const redeliverBefore = new Date(Date.now() - REDELIVER_AFTER_MS).toISOString();
  const { data: rows } = await supabase
    .from("site_changes")
    .select("id, status, field, post_id, media_id, new_value, before_value, attempts")
    .eq("site_id", siteId)
    .or(`status.in.(queued,revert_queued),and(status.in.(delivered,revert_delivered),delivered_at.lt.${redeliverBefore},attempts.lt.${MAX_ATTEMPTS})`)
    .order("created_at", { ascending: true })
    .limit(PULL_BATCH);

  const changes = [];
  for (const r of rows ?? []) {
    const revert = r.status === "revert_queued" || r.status === "revert_delivered";
    // Conditional update: if two pulls race, only one wins each row.
    const { data: claimed } = await supabase
      .from("site_changes")
      .update({
        status: revert ? "revert_delivered" : "delivered",
        delivered_at: new Date().toISOString(),
        attempts: (r.attempts ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", r.id).eq("status", r.status).select("id").maybeSingle();
    if (!claimed) continue;
    changes.push({ id: r.id, op: revert ? "revert" : "apply", field: r.field, post_id: r.post_id, media_id: r.media_id, value: r.new_value, before: revert ? r.before_value : null });
  }
  return json({ changes });
}

// ── inventory: the plugin uploads its pages in parts; the last part triggers the scan ──
async function inventory(supabase: Supabase, site: { id: string }, body: Record<string, unknown>) {
  const uploadId = body.upload_id;
  const part = Number(body.part);
  const total = Number(body.parts_total);
  const kind = String(body.kind ?? "");
  if (!validUploadId(uploadId) || !Number.isInteger(part) || !Number.isInteger(total)) return json({ error: "Bad inventory part" }, 400);
  if (total < 1 || total > MAX_PARTS || part < 0 || part >= total) return json({ error: "Bad inventory part" }, 400);
  if (!(CHUNK_KINDS as readonly string[]).includes(kind)) return json({ error: "Bad inventory kind" }, 400);

  let payload: Record<string, unknown>;
  if (kind === "meta") {
    payload = { sitemap: typeof body.sitemap === "object" && body.sitemap ? body.sitemap : {} };
  } else {
    if (!Array.isArray(body.items) || body.items.length > MAX_ITEMS_PER_PART) return json({ error: "Bad inventory items" }, 400);
    payload = { items: body.items };
  }

  const { error } = await supabase.from("site_inventory_chunks")
    .upsert({ upload_id: uploadId, part, site_id: site.id, kind, payload }, { onConflict: "upload_id,part" });
  if (error) throw new Error("Could not store inventory part: " + error.message);

  const { data: parts } = await supabase.from("site_inventory_chunks")
    .select("part").eq("upload_id", uploadId).eq("site_id", site.id).gte("part", 0);
  if ((parts?.length ?? 0) < total) return json({ ok: true, complete: false });

  // Everything is here. Exactly one request wins the marker row and runs the scan.
  const { error: claim } = await supabase.from("site_inventory_chunks")
    .insert({ upload_id: uploadId, part: -1, site_id: site.id, kind: "marker" });
  if (claim) return json({ ok: true, complete: true });

  // The request is consumed now, so a failing analysis cannot make the plugin re-upload forever.
  await supabase.from("connected_sites").update({ scan_requested_at: null }).eq("id", site.id);
  runInBackground(supabase.functions.invoke("scan-wordpress-site", { body: { site_id: site.id, inventory_upload_id: uploadId } }));
  return json({ ok: true, complete: true });
}

interface Report { id: string; outcome: "applied" | "failed" | "reverted"; before?: string | null; error?: string | null }

async function report(supabase: Supabase, site: { id: string; client_id: string | null; site_url: string }, body: Record<string, unknown>) {
  const results = (Array.isArray(body.results) ? body.results : []) as Report[];
  let processed = 0;
  for (const r of results.slice(0, 50)) {
    if (!r || typeof r.id !== "string" || !["applied", "failed", "reverted"].includes(r.outcome)) continue;
    const { data: change } = await supabase
      .from("site_changes").select("*").eq("id", r.id).eq("site_id", site.id).maybeSingle();
    if (!change) continue; // not this site's change
    const now = new Date().toISOString();

    if (r.outcome === "failed") {
      await supabase.from("site_changes").update({ status: "failed", error_message: str(r.error, 500) ?? "The site could not apply this change.", updated_at: now }).eq("id", change.id);
      if (change.fix_id) await supabase.from("wp_fix_queue").update({ status: "failed", error_message: str(r.error, 500), updated_at: now }).eq("id", change.fix_id);
    } else if (r.outcome === "reverted") {
      await supabase.from("site_changes").update({ status: "reverted", reverted_at: now, updated_at: now }).eq("id", change.id);
      // Back to "pending" so the owner can approve it again if they change their mind.
      if (change.fix_id) await supabase.from("wp_fix_queue").update({ status: "pending", applied_at: null, error_message: null, updated_at: now }).eq("id", change.fix_id);
    } else {
      await supabase.from("site_changes").update({
        status: "applied", applied_at: now, before_value: typeof r.before === "string" ? r.before.slice(0, 5000) : null, error_message: null, updated_at: now,
      }).eq("id", change.id);
      await confirmOnLivePage(supabase, site, { ...change, status: "applied" });
    }
    processed++;
  }
  return json({ ok: true, processed });
}

/** Look at the real page and settle the change as verified / unverified. */
async function confirmOnLivePage(
  supabase: Supabase,
  site: { id: string; client_id: string | null; site_url: string },
  change: { id: string; fix_id: string | null; field: string; new_value: string; page_url: string | null },
) {
  const now = new Date().toISOString();
  const html = change.page_url ? await fetchLiveHtml(change.page_url) : null;
  const check = html
    ? verifyRenderedField(change.field, change.new_value, html)
    : { ok: null, note: change.page_url ? "Could not load the live page to check it." : "This change is not tied to a page we can check." };

  if (check.ok === false) {
    // Saved on the site but not showing: usually a page cache. Keep it
    // "unverified" and re-check from the heartbeat before calling it a failure.
    await supabase.from("site_changes").update({ status: "unverified", verify_note: check.note, updated_at: now }).eq("id", change.id);
    return;
  }
  await supabase.from("site_changes").update({
    status: check.ok ? "verified" : "applied",
    verified_at: check.ok ? now : null,
    verify_note: check.note,
    updated_at: now,
  }).eq("id", change.id);
  if (change.fix_id) {
    await supabase.from("wp_fix_queue").update({ status: "applied", applied_at: now, error_message: null, updated_at: now }).eq("id", change.fix_id);
  }
  if (site.client_id) {
    await logActivity(supabase, site.client_id, {
      type: "seo_fix_applied",
      title: `Applied SEO fix: ${change.field.replace(/_/g, " ")}`,
      description: site.site_url,
      icon: "wrench",
      metadata: { change_id: change.id, fix_id: change.fix_id, field: change.field, verified: check.ok === true },
    });
  }
}

/** Page caches expire: give 'unverified' changes another look on later heartbeats. */
async function reverifyStale(supabase: Supabase, siteId: string) {
  const before = new Date(Date.now() - REVERIFY_AFTER_MS).toISOString();
  const { data: stale } = await supabase
    .from("site_changes")
    .select("id, fix_id, field, new_value, page_url, attempts, applied_at")
    .eq("site_id", siteId).eq("status", "unverified").lt("updated_at", before)
    .order("updated_at", { ascending: true }).limit(REVERIFY_BATCH);
  if (!stale?.length) return;

  const { data: site } = await supabase.from("connected_sites").select("id, client_id, site_url").eq("id", siteId).single();
  for (const c of stale) {
    const ageMs = Date.now() - new Date(c.applied_at ?? Date.now()).getTime();
    if (ageMs > 24 * 3_600_000) {
      // A day later and the page still doesn't show it: stop retrying and say so.
      const now = new Date().toISOString();
      await supabase.from("site_changes").update({ status: "failed", error_message: "Saved on the site, but the live page still doesn't show it after 24 hours (a page cache or another SEO plugin may be overriding it).", updated_at: now }).eq("id", c.id);
      if (c.fix_id) await supabase.from("wp_fix_queue").update({ status: "failed", error_message: "Saved on the site, but the live page doesn't show it.", updated_at: now }).eq("id", c.fix_id);
      continue;
    }
    await confirmOnLivePage(supabase, site, c);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const raw = await req.text();
    if (raw.length > 512_000) return json({ error: "Body too large" }, 413);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const action = String(body.action ?? "");

    if (action === "register") return await register(supabase, body);

    const auth = await authenticate(supabase, req, raw);
    if (auth.error) return auth.error;
    const site = auth.site;

    switch (action) {
      case "heartbeat": return await heartbeat(supabase, site, body);
      case "pull": return await pull(supabase, site.id);
      case "report": return await report(supabase, site, body);
      case "inventory": return await inventory(supabase, site, body);
      default: return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("site-agent error:", msg);
    return json({ error: "Internal error" }, 500);
  }
});
