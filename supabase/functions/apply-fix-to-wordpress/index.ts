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

async function findPostByUrl(wpBase: string, auth: string, url: string) {
  // Try to look up the post by its slug
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
      .select("wordpress_url, wordpress_username, wordpress_app_password")
      .eq("client_id", fix.client_account_id)
      .maybeSingle();

    if (!creds?.wordpress_url || !creds.wordpress_username || !creds.wordpress_app_password) {
      throw new Error("WordPress credentials are not configured for this client");
    }

    const wpBase = creds.wordpress_url.replace(/\/+$/, "");
    const auth = basicAuthHeader(creds.wordpress_username, creds.wordpress_app_password);
    const payload = ready.payload || {};
    const newValue = String(payload.value || "");
    const postUrl = String(payload.post_url || creds.wordpress_url);

    const post = await findPostByUrl(wpBase, auth, postUrl);
    if (!post) throw new Error("Could not locate the WordPress page/post to update");

    let beforeSnap: Record<string, unknown> = {};
    let afterSnap: Record<string, unknown> = {};
    let updateBody: Record<string, unknown> = {};

    if (ready.type === "wp_meta_title") {
      beforeSnap = { title: post.current.title?.rendered };
      updateBody = { title: newValue };
      afterSnap = { title: newValue };
    } else if (ready.type === "wp_meta_description") {
      // Try Yoast first, then RankMath, then fall back to excerpt
      const yoastMeta = post.current.yoast_head_json?.description;
      beforeSnap = { meta_description: yoastMeta || post.current.excerpt?.rendered };
      updateBody = {
        excerpt: newValue,
        meta: { _yoast_wpseo_metadesc: newValue, rank_math_description: newValue },
      };
      afterSnap = { meta_description: newValue };
    } else if (ready.type === "wp_image_alt") {
      // For image alt updates we need a media id — payload should include image_src
      const imgSrc = String(payload.image_src || "");
      const mediaRes = await fetch(`${wpBase}/wp-json/wp/v2/media?search=${encodeURIComponent(imgSrc.split("/").pop() || "")}`, {
        headers: { Authorization: auth },
      });
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
    } else {
      throw new Error(`Unsupported fix type: ${ready.type}`);
    }

    if (ready.type !== "wp_image_alt") {
      const updateRes = await fetch(`${wpBase}/wp-json/wp/v2/${post.type}/${post.id}`, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify(updateBody),
      });
      if (!updateRes.ok) throw new Error(`WordPress update failed: ${updateRes.status} ${await updateRes.text()}`);
    }

    await supabase
      .from("ai_fixes")
      .update({
        status: "applied",
        applied_at: new Date().toISOString(),
        before_snapshot: beforeSnap,
        after_snapshot: afterSnap,
      })
      .eq("id", fixId);

    return new Response(
      JSON.stringify({ success: true, before: beforeSnap, after: afterSnap }),
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