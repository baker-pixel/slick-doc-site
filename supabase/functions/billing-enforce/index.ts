import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { errorResponse, handleOptions, jsonResponse } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { checkPipelineAuth } from "../_shared/auth.ts";
import { applyBillingDecision, isBillingEnforced } from "../_shared/billingGate.ts";
import { sendServicesPausedEmail } from "../_shared/billingEmail.ts";

// Hourly sweep. Webhooks handle the instant transitions (payment succeeded,
// subscription canceled); this catches the time-based ones: past_due accounts
// whose grace window just ended, and accounts that never subscribed.
serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const supabase = serviceClient();
    let body: { password?: string } = {};
    try { body = await req.json(); } catch { /* cron sends {} */ }
    if (!(await checkPipelineAuth(req, supabase, body.password))) return errorResponse("Unauthorized", 401);

    const enforced = await isBillingEnforced(supabase);

    const { data: accounts, error } = await supabase
      .from("client_accounts")
      .select("id, email, first_name, status, paused_for_billing")
      .or("status.eq.active,paused_for_billing.eq.true");
    if (error) throw error;

    const tally = { paused: 0, resumed: 0, unchanged: 0, enforced };
    for (const acct of accounts ?? []) {
      try {
        const decision = await applyBillingDecision(supabase, acct.id, enforced);
        if (decision === "pause" && enforced) {
          tally.paused++;
          await sendServicesPausedEmail(acct.email, acct.first_name).catch((e) =>
            console.error("paused email failed:", e)
          );
        } else if (decision === "resume") {
          tally.resumed++;
        } else {
          tally.unchanged++;
        }
      } catch (e) {
        console.error(`billing-enforce: ${acct.id} failed:`, e);
      }
    }
    return jsonResponse(tally);
  } catch (err) {
    console.error("billing-enforce failed:", err);
    return errorResponse(err);
  }
});
