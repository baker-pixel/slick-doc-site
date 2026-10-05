import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions, jsonResponse } from "../_shared/http.ts";

// Public lookup for the online Quick Analysis report (/quick-report/:token).
// Returns only what the report page renders -- never the prospect's email,
// phone or other contact data -- and only for an exact, unguessable token.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { token } = await req.json().catch(() => ({}));
    if (typeof token !== "string" || !UUID_RE.test(token)) {
      return jsonResponse({ found: false }, 404);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: prospect, error } = await supabase
      .from("prospects")
      .select("id, name, website_url, created_at, analysis_snapshot")
      .eq("report_token", token)
      .maybeSingle();

    if (error) throw error;
    if (!prospect || !prospect.analysis_snapshot) return jsonResponse({ found: false }, 404);

    const { data: readiness } = await supabase
      .from("ai_readiness_scores")
      .select("total_score")
      .eq("prospect_id", prospect.id)
      .maybeSingle();

    return jsonResponse({
      found: true,
      report: {
        name: prospect.name,
        websiteUrl: prospect.website_url,
        createdAt: prospect.created_at,
        analysis: prospect.analysis_snapshot,
        aiReadinessScore: readiness?.total_score ?? null,
      },
    });
  } catch (e) {
    console.error("get-prospect-report error:", e);
    return jsonResponse({ error: "Something went wrong loading this report." }, 500);
  }
});
