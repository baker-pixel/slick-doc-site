import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { tierPolicy } from "../_shared/tierPolicy.ts";
import { logActivity } from "../_shared/activityLog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIMEOUT_MS = 10_000;

interface Fix {
  id: string;
  site_id: string;
  post_id: number | null;
  media_id: number | null;
  field: string;
  suggested_value: string;
}

interface ConnectedSite {
  site_url: string;
  token: string;
  client_id: string | null;
}

async function applyFix(siteUrl: string, token: string, fix: Fix): Promise<void> {
  const payload: Record<string, unknown> = {
    field: fix.field,
    value: fix.suggested_value,
  };
  if (fix.media_id) {
    payload.media_id = fix.media_id;
  } else if (fix.post_id) {
    payload.post_id = fix.post_id;
  } else {
    throw new Error("Fix has no post_id or media_id");
  }

  const res = await fetch(`${siteUrl}/wp-json/orangedoor/v1/apply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-OD-Token": token,
    },
    body: JSON.stringify({ fixes: [payload] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
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
}

async function verifyFix(siteUrl: string, token: string, postId: number): Promise<boolean> {
  try {
    const res = await fetch(`${siteUrl}/wp-json/orangedoor/v1/verify/${postId}`, {
      headers: { "X-OD-Token": token },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.saved === true;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let fixId: string | null = null;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    fixId = body.fix_id as string;
    if (!fixId) throw new Error("fix_id required");

    // Verify caller owns this fix via RLS (user client can only see their own site's fixes)
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { authorization: authHeader } } },
    );
    const { data: ownedFix } = await userClient
      .from("wp_fix_queue")
      .select("id")
      .eq("id", fixId)
      .maybeSingle();
    if (!ownedFix) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch fix
    const { data: fix, error: fixErr } = await supabase
      .from("wp_fix_queue")
      .select("*")
      .eq("id", fixId)
      .single();
    if (fixErr || !fix) throw new Error("Fix not found");

    if (fix.status === "applied") {
      return new Response(JSON.stringify({ success: true, fix_id: fixId, status: "applied" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch site credentials
    const { data: site, error: siteErr } = await supabase
      .from("connected_sites")
      .select("site_url, token, client_id")
      .eq("id", (fix as Fix).site_id)
      .single();
    if (siteErr || !site) throw new Error("Connected site not found");

    const { site_url, token, client_id } = site as ConnectedSite;

    // Tier gate: advisory-only plans don't get auto-applied fixes. Same rule
    // as the admin path in apply-fix-to-wordpress — the client's one-click
    // apply must not bypass it.
    if (client_id) {
      const { data: client } = await supabase
        .from("client_accounts").select("tier").eq("id", client_id).maybeSingle();
      if (tierPolicy(client?.tier).seo.applyMode === "off") {
        return new Response(
          JSON.stringify({ error: "Your plan is advisory-only — SEO fixes aren't applied automatically. Contact your Orange Door team to upgrade." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Mark approved
    await supabase
      .from("wp_fix_queue")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", fixId);

    // Apply the fix
    await applyFix(site_url, token, fix as Fix);

    // Verify (best-effort, only for post-based fixes)
    let verified = true;
    if ((fix as Fix).post_id) {
      verified = await verifyFix(site_url, token, (fix as Fix).post_id!);
    }

    const finalStatus = verified ? "applied" : "failed";
    const errorMsg = verified ? null : "Verification check returned false after apply";

    await supabase
      .from("wp_fix_queue")
      .update({
        status:        finalStatus,
        applied_at:    verified ? new Date().toISOString() : null,
        error_message: errorMsg,
        updated_at:    new Date().toISOString(),
      })
      .eq("id", fixId);

    // Log as work done so reporting sees client-approved fixes too, not just
    // admin-applied ones.
    if (verified && client_id) {
      await logActivity(supabase, client_id, {
        type: "seo_fix_applied",
        title: `Applied SEO fix: ${String((fix as Fix).field).replace(/_/g, " ")}`,
        description: site_url,
        icon: "wrench",
        metadata: { fix_id: fixId, field: (fix as Fix).field, source: "client_approved" },
      });
    }

    return new Response(
      JSON.stringify({ success: verified, fix_id: fixId, status: finalStatus }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("approve-wp-fix error:", msg);

    if (fixId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await supabase
        .from("wp_fix_queue")
        .update({ status: "failed", error_message: msg, updated_at: new Date().toISOString() })
        .eq("id", fixId)
        .then(undefined, () => {});
    }

    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
