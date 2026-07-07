import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions, jsonResponse, errorResponse } from "../_shared/http.ts";
import { checkAdminAuth } from "../_shared/auth.ts";

// Real data aggregation, not an AI call: pulls this client's earliest vs.
// most recent SEO audit score and turns it into a before/after comparison.
// No LLM involved on purpose -- there's nothing to generate, only real
// numbers to compare, and fabricating narrative around them would be worse
// than just showing the real delta.

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { clientId, password } = await req.json();
    if (!clientId) throw new Error("clientId is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const auth = await checkAdminAuth(req, supabase, password);
    if (!auth.authorized) return errorResponse("Unauthorized", 401);

    const { data: audits, error } = await supabase
      .from("seo_audits")
      .select("score, created_at")
      .eq("client_account_id", clientId)
      .not("score", "is", null)
      .order("created_at", { ascending: true });

    if (error) throw error;

    if (!audits || audits.length < 2) {
      return errorResponse(
        `This client has ${audits?.length ?? 0} scored SEO audit${audits?.length === 1 ? "" : "s"}. ` +
          "Need at least 2, run over time, to generate a real before/after comparison. Run another SEO audit later and try again.",
        422,
      );
    }

    const oldest = audits[0];
    const newest = audits[audits.length - 1];
    const delta = (newest.score ?? 0) - (oldest.score ?? 0);

    const showcase = {
      project_type: "seo_optimization",
      description: `SEO score comparison from ${new Date(oldest.created_at).toLocaleDateString()} to ${new Date(newest.created_at).toLocaleDateString()}.`,
      before_stats: { seo_score: oldest.score },
      after_stats: { seo_score: newest.score },
      improvements: [
        {
          metric: "SEO Score",
          before: String(oldest.score),
          after: String(newest.score),
          improvement: delta >= 0 ? `+${delta} points` : `${delta} points`,
        },
      ],
    };

    return jsonResponse({ showcase });
  } catch (err) {
    console.error("generate-before-after error:", err);
    return errorResponse(err);
  }
});
