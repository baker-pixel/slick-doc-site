import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkAdminAuth } from "../_shared/auth.ts";
import { tierPolicy } from "../_shared/tierPolicy.ts";
import { logActivity } from "../_shared/activityLog.ts";

// Baseline re-check (architecture v2 safety): the fix value was computed at
// audit time; before writing, confirm the live value still matches what the
// audit saw, so we never overwrite content the client changed since. Returns
// null when the live value can't be read (then we proceed best-effort).
async function currentFieldValue(fixType: string, payload: Record<string, unknown>): Promise<string | null> {
  const postUrl = String(payload.post_url ?? "");
  if (!postUrl) return null;
  try {
    const res = await fetch(postUrl, { headers: { "User-Agent": "OrangeDoorSEOBot/1.0" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const html = await res.text();
    if (fixType === "wp_meta_title") return (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? "").trim();
    if (fixType === "wp_meta_description") return (html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? "").trim();
    return null;
  } catch {
    return null;
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ApplyRequest {
  fix_id: string;
}

function basicAuthHeader(user: string, pass: string) {
  return "Basic " + btoa(`${user}:${pass}`);
}

// Maps old ai_fixes type names → plugin field names
const TYPE_TO_FIELD: Record<string, string> = {
  wp_meta_title:       "meta_title",
  wp_meta_description: "meta_desc",
  wp_focus_keyword:    "focus_keyword",
  wp_image_alt:        "alt_text",
  wp_canonical:        "canonical",
  wp_slug:             "slug",
  wp_title:            "title",
};

// ── Plugin-based apply (preferred) ───────────────────────────────────────────

async function applyViaPlugin(
  wpBase: string,
  token: string,
  fixType: string,
  payload: Record<string, unknown>,
): Promise<{ before: Record<string, unknown>; after: Record<string, unknown> }> {
  const field = TYPE_TO_FIELD[fixType] ?? fixType.replace("wp_", "");
  const value = String(payload.value ?? "");
  const postUrl = String(payload.post_url ?? "");
  const imageSrc = String(payload.image_src ?? "");

  // Resolve post_id from URL using WP REST API (no auth needed for public slug lookup)
  let postId: number | null = null;
  let mediaId: number | null = null;

  if (field === "alt_text" && imageSrc) {
    // For alt text, use image src to find media item via unauthenticated WP REST search
    const fname = imageSrc.split("/").pop() ?? "";
    const mRes = await fetch(`${wpBase}/wp-json/wp/v2/media?search=${encodeURIComponent(fname)}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (mRes.ok) {
      const mData = await mRes.json();
      if (Array.isArray(mData) && mData.length > 0) mediaId = mData[0].id;
    }
  } else if (postUrl) {
    const slug = postUrl.replace(/\/+$/, "").split("/").pop() ?? "";
    for (const pt of ["pages", "posts"]) {
      const pRes = await fetch(`${wpBase}/wp-json/wp/v2/${pt}?slug=${encodeURIComponent(slug)}`, {
        signal: AbortSignal.timeout(8_000),
      });
      if (pRes.ok) {
        const pData = await pRes.json();
        if (Array.isArray(pData) && pData.length > 0) { postId = pData[0].id; break; }
      }
    }
  }

  if (!postId && !mediaId) {
    throw new Error(`Could not resolve post/media ID from URL: ${postUrl || imageSrc}`);
  }

  const fixPayload: Record<string, unknown> = { field, value };
  if (mediaId) { fixPayload.media_id = mediaId; }
  else if (postId) { fixPayload.post_id = postId; }

  const res = await fetch(`${wpBase}/wp-json/orangedoor/v1/apply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-OD-Token": token,
    },
    body: JSON.stringify({ fixes: [fixPayload] }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Plugin /apply returned ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  const failed = data?.failed ?? [];
  if (failed.length > 0) {
    throw new Error(`Plugin reported failure: ${failed[0]?.error ?? "unknown"}`);
  }

  return {
    before: {},
    after: { value },
  };
}

// ── Basic-Auth apply (fallback for clients without the plugin) ────────────────

async function findPostByUrl(wpBase: string, auth: string, url: string) {
  const slug = url.replace(/\/+$/, "").split("/").pop() || "";
  const res = await fetch(`${wpBase}/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}`, {
    headers: { Authorization: auth },
  });
  if (res.ok) {
    const arr = await res.json();
    if (Array.isArray(arr) && arr.length > 0) return { id: arr[0].id, type: "pages", current: arr[0] };
  }
  const res2 = await fetch(`${wpBase}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}`, {
    headers: { Authorization: auth },
  });
  if (res2.ok) {
    const arr2 = await res2.json();
    if (Array.isArray(arr2) && arr2.length > 0) return { id: arr2[0].id, type: "posts", current: arr2[0] };
  }
  return null;
}

async function applyViaBasicAuth(
  wpBase: string,
  username: string,
  appPassword: string,
  fixType: string,
  payload: Record<string, unknown>,
): Promise<{ before: Record<string, unknown>; after: Record<string, unknown> }> {
  const auth = basicAuthHeader(username, appPassword);
  const newValue = String(payload.value ?? "");
  const postUrl = String(payload.post_url ?? wpBase);

  let beforeSnap: Record<string, unknown> = {};
  let afterSnap: Record<string, unknown> = {};
  let updateBody: Record<string, unknown> = {};

  if (fixType === "wp_image_alt") {
    const imgSrc = String(payload.image_src ?? "");
    const mediaRes = await fetch(
      `${wpBase}/wp-json/wp/v2/media?search=${encodeURIComponent(imgSrc.split("/").pop() ?? "")}`,
      { headers: { Authorization: auth } },
    );
    if (!mediaRes.ok) throw new Error("Could not look up image in WordPress media library");
    const media = await mediaRes.json();
    if (!Array.isArray(media) || media.length === 0) throw new Error("Image not found in WordPress media library");
    const mediaId = media[0].id;
    beforeSnap = { alt_text: media[0].alt_text };
    const updateRes = await fetch(`${wpBase}/wp-json/wp/v2/media/${mediaId}`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ alt_text: newValue }),
    });
    if (!updateRes.ok) throw new Error(`WordPress update failed: ${updateRes.status} ${await updateRes.text()}`);
    afterSnap = { alt_text: newValue };
    return { before: beforeSnap, after: afterSnap };
  }

  const post = await findPostByUrl(wpBase, auth, postUrl);
  if (!post) throw new Error("Could not locate the WordPress page/post to update");

  if (fixType === "wp_meta_title") {
    beforeSnap = { title: post.current.title?.rendered };
    updateBody = { title: newValue };
    afterSnap = { title: newValue };
  } else if (fixType === "wp_meta_description") {
    const yoastMeta = post.current.yoast_head_json?.description;
    beforeSnap = { meta_description: yoastMeta || post.current.excerpt?.rendered };
    updateBody = {
      excerpt: newValue,
      meta: { _yoast_wpseo_metadesc: newValue, rank_math_description: newValue },
    };
    afterSnap = { meta_description: newValue };
  } else {
    // For OG/canonical/schema types that Basic Auth can't easily set, write via meta
    updateBody = { meta: { [`_od_${fixType.replace("wp_", "")}`]: newValue } };
    afterSnap = { value: newValue };
  }

  const updateRes = await fetch(`${wpBase}/wp-json/wp/v2/${post.type}/${post.id}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(updateBody),
  });
  if (!updateRes.ok) throw new Error(`WordPress update failed: ${updateRes.status} ${await updateRes.text()}`);

  return { before: beforeSnap, after: afterSnap };
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let fixId: string | null = null;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = (await req.json()) as ApplyRequest & {
      password?: string;
      client_id?: string;
      seo_fix?: { type?: string; payload?: Record<string, unknown>; expected_baseline?: unknown };
    };

    // This writes to a client's live WordPress site with server-held
    // credentials -- gate it. Accepts a server-to-server service-role call,
    // an admin session (JWT the browser auto-attaches), or the shared
    // password. verify_jwt stays false so service-role callers still work.
    const auth = await checkAdminAuth(req, supabase, body.password);
    if (!auth.authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jsonRes = (b: unknown, status = 200) =>
      new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // ── Direct SEO-fix mode ──
    // Applies a fix straight from an SEO audit finding (not an ai_fixes row):
    // { client_id, seo_fix: { type, payload, expected_baseline } }. Human-gated
    // (this handler already required admin/service auth above), tier-gated, and
    // baseline-checked before it touches the live site.
    if (body.seo_fix) {
      const { client_id, seo_fix } = body as { client_id?: string; seo_fix?: { type?: string; payload?: Record<string, unknown>; expected_baseline?: unknown } };
      if (!client_id || !seo_fix?.type || !String(seo_fix.type).startsWith("wp_")) {
        return jsonRes({ error: "client_id and a wp_* seo_fix are required" }, 400);
      }

      // Tier gate: advisory-only plans don't get auto-applied fixes.
      const { data: client } = await supabase.from("client_accounts").select("tier").eq("id", client_id).maybeSingle();
      if (tierPolicy(client?.tier).seo.applyMode === "off") {
        return jsonRes({ error: "This client's plan is advisory-only — SEO fixes aren't applied automatically." }, 403);
      }

      const { data: creds } = await supabase
        .from("client_credentials")
        .select("wordpress_url, wordpress_username, wordpress_app_password, wordpress_plugin_api_key")
        .eq("client_id", client_id).maybeSingle();
      if (!creds?.wordpress_url) {
        return jsonRes({ error: "No WordPress connection configured for this client." }, 422);
      }

      const wpBase = creds.wordpress_url.replace(/\/+$/, "");
      const fixType = String(seo_fix.type);
      const payload = (seo_fix.payload ?? {}) as Record<string, unknown>;

      // Baseline re-check — abort if the page changed since the audit.
      if (typeof seo_fix.expected_baseline === "string" && seo_fix.expected_baseline) {
        const cur = await currentFieldValue(fixType, payload);
        if (cur !== null && cur !== seo_fix.expected_baseline) {
          return jsonRes({ error: "This page changed since the audit was run. Re-run the audit before applying so the fix targets the current content." }, 409);
        }
      }

      let snapshots: { before: Record<string, unknown>; after: Record<string, unknown> };
      if (creds.wordpress_plugin_api_key) {
        snapshots = await applyViaPlugin(wpBase, creds.wordpress_plugin_api_key, fixType, payload);
      } else if (creds.wordpress_username && creds.wordpress_app_password) {
        snapshots = await applyViaBasicAuth(wpBase, creds.wordpress_username, creds.wordpress_app_password, fixType, payload);
      } else {
        return jsonRes({ error: "No WordPress credentials. Install the OrangeDoor plugin or add Basic Auth." }, 422);
      }

      await logActivity(supabase, client_id, {
        type: "seo_fix_applied",
        title: `Applied SEO fix: ${fixType.replace("wp_", "").replace(/_/g, " ")}`,
        description: String(payload.post_url ?? wpBase),
        icon: "wrench",
        metadata: { fixType, page: payload.post_url ?? null },
      });

      return jsonRes({ success: true, before: snapshots.before, after: snapshots.after });
    }

    fixId = body.fix_id;
    if (!fixId) {
      return new Response(JSON.stringify({ error: "fix_id or seo_fix required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: fix, error: fixErr } = await supabase
      .from("ai_fixes")
      .select("*")
      .eq("id", fixId)
      .single();
    if (fixErr || !fix) throw new Error("Fix not found");

    const ready = fix.ready_to_apply as { type?: string; payload?: Record<string, unknown> } | null;
    if (!ready?.type || !String(ready.type).startsWith("wp_")) {
      throw new Error("This fix cannot be auto-published (not a WordPress action)");
    }

    const { data: creds } = await supabase
      .from("client_credentials")
      .select("wordpress_url, wordpress_username, wordpress_app_password, wordpress_plugin_api_key")
      .eq("client_id", fix.client_account_id)
      .maybeSingle();

    if (!creds?.wordpress_url) {
      throw new Error("WordPress site URL is not configured for this client");
    }

    const wpBase = creds.wordpress_url.replace(/\/+$/, "");
    const fixType = String(ready.type);
    const payload = (ready.payload ?? {}) as Record<string, unknown>;

    let snapshots: { before: Record<string, unknown>; after: Record<string, unknown> };

    if (creds.wordpress_plugin_api_key) {
      // Preferred: OrangeDoor plugin installed — use the /apply endpoint with correct token
      snapshots = await applyViaPlugin(wpBase, creds.wordpress_plugin_api_key, fixType, payload);
    } else if (creds.wordpress_username && creds.wordpress_app_password) {
      // Fallback: Basic Auth
      snapshots = await applyViaBasicAuth(wpBase, creds.wordpress_username, creds.wordpress_app_password, fixType, payload);
    } else {
      throw new Error("No WordPress credentials configured. Install the OrangeDoor plugin or add Basic Auth credentials.");
    }

    await supabase
      .from("ai_fixes")
      .update({
        status: "applied",
        applied_at: new Date().toISOString(),
        before_snapshot: snapshots.before,
        after_snapshot: snapshots.after,
      })
      .eq("id", fixId);

    return new Response(
      JSON.stringify({ success: true, before: snapshots.before, after: snapshots.after }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("apply-fix-to-wordpress error:", msg);

    if (fixId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await supabase.from("ai_fixes").update({ status: "failed", error_message: msg }).eq("id", fixId);
    }

    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
