import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkAdminAuth } from "../_shared/auth.ts";
import { tierPolicy } from "../_shared/tierPolicy.ts";
import { logActivity } from "../_shared/activityLog.ts";
import { applyWpFix, verifyWpFix, currentWpFieldValue } from "../_shared/wpApply.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ApplyRequest {
  fix_id: string;
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
      const postUrl = typeof payload.post_url === "string" ? payload.post_url : null;

      // Baseline re-check — abort if the page changed since the audit.
      if (typeof seo_fix.expected_baseline === "string" && seo_fix.expected_baseline) {
        const cur = await currentWpFieldValue(fixType, postUrl ?? "");
        if (cur !== null && cur !== seo_fix.expected_baseline) {
          return jsonRes({ error: "This page changed since the audit was run. Re-run the audit before applying so the fix targets the current content." }, 409);
        }
      }

      const result = await applyWpFix(
        wpBase,
        { pluginToken: creds.wordpress_plugin_api_key, basicAuthUser: creds.wordpress_username, basicAuthPass: creds.wordpress_app_password },
        { fixType, value: String(payload.value ?? ""), postUrl, imageSrc: typeof payload.image_src === "string" ? payload.image_src : null },
      );

      // Post-apply verify — the plugin returning 200 only means it accepted
      // the request, not that the value actually persisted. Only possible
      // when we resolved a postId and have the plugin token (Basic Auth has
      // no equivalent read-back endpoint).
      if (creds.wordpress_plugin_api_key && result.postId) {
        const verified = await verifyWpFix(wpBase, creds.wordpress_plugin_api_key, result.postId, fixType, String(payload.value ?? ""));
        if (!verified) {
          return jsonRes({ error: "Fix was sent but WordPress didn't confirm it saved. Try again or check the page directly." }, 502);
        }
      }

      await logActivity(supabase, client_id, {
        type: "seo_fix_applied",
        title: `Applied SEO fix: ${fixType.replace("wp_", "").replace(/_/g, " ")}`,
        description: String(payload.post_url ?? wpBase),
        icon: "wrench",
        metadata: { fixType, page: payload.post_url ?? null },
      });

      return jsonRes({ success: true, before: result.before, after: result.after });
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
    const postUrl = typeof payload.post_url === "string" ? payload.post_url : null;

    const result = await applyWpFix(
      wpBase,
      { pluginToken: creds.wordpress_plugin_api_key, basicAuthUser: creds.wordpress_username, basicAuthPass: creds.wordpress_app_password },
      { fixType, value: String(payload.value ?? ""), postUrl, imageSrc: typeof payload.image_src === "string" ? payload.image_src : null },
    );

    if (creds.wordpress_plugin_api_key && result.postId) {
      const verified = await verifyWpFix(wpBase, creds.wordpress_plugin_api_key, result.postId, fixType, String(payload.value ?? ""));
      if (!verified) {
        await supabase.from("ai_fixes").update({ status: "failed", error_message: "Applied but WordPress didn't confirm it saved" }).eq("id", fixId);
        return new Response(
          JSON.stringify({ error: "Fix was sent but WordPress didn't confirm it saved. Try again or check the page directly." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    await supabase
      .from("ai_fixes")
      .update({
        status: "applied",
        applied_at: new Date().toISOString(),
        before_snapshot: result.before,
        after_snapshot: result.after,
      })
      .eq("id", fixId);

    return new Response(
      JSON.stringify({ success: true, before: result.before, after: result.after }),
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
