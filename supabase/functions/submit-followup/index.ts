import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, jsonResponse } from "../_shared/http.ts";
import { fullOverallScore, scoreFollowUp, validateAnswers } from "../_shared/followUp.ts";
import { recommendTier } from "../_shared/systemTier.ts";

// Second step of the free scan. The visitor's own report token (a random UUID only they hold,
// from the scan result / emailed link) authorises saving their answers. Answers are fixed
// choices, validated strictly, scored by the shared gapScore formula, and folded into the
// lead's overall score so it covers all six SYSTEM categories. Responds with the new scores only;
// no contact data ever leaves this function.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { token, answers } = await req.json().catch(() => ({}));
    if (typeof token !== "string" || !UUID_RE.test(token)) return jsonResponse({ error: "Report not found" }, 404);

    const checked = validateAnswers(answers);
    if (!checked.ok) return jsonResponse({ error: checked.error }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: prospect, error } = await supabase
      .from("prospects").select("id, analysis_snapshot").eq("report_token", token).maybeSingle();
    if (error) throw error;
    const a = prospect?.analysis_snapshot;
    if (!prospect || !a?.seo || !a?.technical || !a?.conversion || !a?.engagement || !a?.metrics) {
      return jsonResponse({ error: "Report not found" }, 404);
    }

    const scores = scoreFollowUp(checked.answers);
    const overallScore = fullOverallScore(
      { seo: a.seo.score, technical: a.technical.score, conversion: a.conversion.score, engagement: a.engagement.score, metrics: a.metrics.score },
      scores,
    );
    const tier = recommendTier(overallScore);

    const { error: updateError } = await supabase.from("prospects").update({
      followup_answers: checked.answers,
      followup_scores: scores,
      followup_completed_at: new Date().toISOString(),
      gap_score: overallScore,
      recommended_tier: tier,
    }).eq("id", prospect.id);
    if (updateError) throw updateError;

    return jsonResponse({ scores, overallScore, tier });
  } catch (e) {
    console.error("submit-followup error:", e);
    return jsonResponse({ error: "Something went wrong saving your answers. Please try again." }, 500);
  }
});
