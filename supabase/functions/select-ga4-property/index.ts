import { handleOptions, jsonResponse, errorResponse } from "../_shared/http.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// A client's Google login can see more than one GA4 property (agency,
// multi-brand accounts) -- google-analytics-oauth-callback stores the full
// list on client_oauth_tokens.token_metadata.properties and leaves
// ga4_property_id unset until the client picks one here. Validating
// property_id against that stored list (not trusting it blind) is the only
// guard: it proves the property came from this client's own OAuth grant,
// not an arbitrary ID for someone else's property.
Deno.serve(async (req) => {
  const opts = handleOptions(req);
  if (opts) return opts;

  try {
    const { client_account_id, property_id } = await req.json();
    if (!client_account_id || !property_id) {
      return errorResponse("client_account_id and property_id are required", 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: token, error: tokenErr } = await supabase
      .from("client_oauth_tokens")
      .select("token_metadata")
      .eq("client_id", client_account_id)
      .eq("platform", "google_analytics")
      .maybeSingle();

    if (tokenErr) throw tokenErr;
    const properties = (token?.token_metadata as { properties?: Array<{ id: string }> } | null)?.properties ?? [];
    if (!properties.some((p) => p.id === property_id)) {
      return errorResponse("That property wasn't in this client's Google Analytics account list", 400);
    }

    const { error: updateErr } = await supabase
      .from("client_accounts")
      .update({ ga4_property_id: property_id })
      .eq("id", client_account_id);
    if (updateErr) throw updateErr;

    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse(e);
  }
});
