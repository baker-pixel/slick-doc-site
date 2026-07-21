import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, jsonResponse, errorResponse } from "../_shared/http.ts";
import { syncClientAccountFromSubmission } from "../_shared/onboardingContext.ts";

// Called right after a gap-analysis submit. Ties the submission to an
// existing client_accounts row (context_profile + intake_completed_at) via
// the service role, since the marketing site has no client session and the
// RLS-hardened client_accounts UPDATE policy blocks anon browser writes.
serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { submission_id } = await req.json();
    if (!submission_id) return errorResponse("submission_id required", 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: submission, error } = await supabase
      .from("gap_analysis_submissions")
      .select("*")
      .eq("id", submission_id)
      .single();

    if (error || !submission) return errorResponse("Submission not found", 404);

    const result = await syncClientAccountFromSubmission(supabase, submission);
    return jsonResponse(result);
  } catch (err) {
    console.error("sync-intake-context failed:", err);
    return errorResponse(err);
  }
});
