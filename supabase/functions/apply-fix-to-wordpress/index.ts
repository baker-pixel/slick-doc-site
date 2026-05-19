import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ApplyRequest {
  fix_id: string;
}

function basicAuthHeader(user: string, pass: string) {
  return "Basic " + btoa(`${user}:${pass}`);
}

// ── Plugin-based apply (preferred) ───────────────────────────────────────────

async function applyViaPlugin(
  wpBase: string,
  apiKey: string,
  fixType: string,
  payload: Record<string, unknown>,
  fixId: string,
): Promise<{ before: Record<string, unknown>; after: Record<string, unknown> }> {
  const res = await fetch(`${wpBase}/wp-json/orangedoor/v1/apply-fixes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-OD-API-Key": apiKey,
    },
    body: JSON.stringify({
      fixes: [{
        fix_id: fixId,
        type: fixType,
        value: String(payload.value ?? ""),
        post_url: String(payload.post_url ?? wpBase),
        image_src: String(payload.image_src ?? ""),
      }],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Plugin returned ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  const result = data?.results?.[0];
  if (!result?.success) {
    throw new Error(result?.error ?? "Plugin reported failure");
  }

  return {
    before: result.before !== undefined ? { value: result.before } : {},
    after: { value: String(payload.value ?? "") },
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

    const body = (await req.json()) as ApplyRequest;
    fixId = body.fix_id;
    if (!fixId) {
      return new Response(JSON.stringify({ error: "fix_id required" }), {
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
      // Preferred: OrangeDoor plugin installed
      snapshots = await applyViaPlugin(wpBase, creds.wordpress_plugin_api_key, fixType, payload, fixId);
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
