import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, jsonResponse, errorResponse } from "../_shared/http.ts";

// Public lookup of ONE open invitation by its secret token, for the accept-
// invite screen (the visitor has no session yet). Replaces a public RLS
// SELECT policy that exposed every open invitation and token to anyone.
serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { token } = await req.json();
    if (typeof token !== "string" || token.length < 16 || token.length > 200) {
      return errorResponse("Invalid invitation token", 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("client_invitations")
      .select("id, email, first_name, last_name, client_account_id")
      .eq("token", token)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error) throw error;
    if (!data) return jsonResponse({ invitation: null });
    return jsonResponse({ invitation: data });
  } catch (err) {
    console.error("get-invitation failed:", err);
    return errorResponse(err);
  }
});
