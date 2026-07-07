import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions, jsonResponse, errorResponse } from "../_shared/http.ts";

// One-time bootstrap for real per-user admin auth. Gated behind the
// existing ADMIN_PASSWORD (the very thing this whole effort is replacing)
// since at bootstrap time there is no real admin account yet to gate it
// with instead -- this function's only job is to create the first real
// accounts, after which real login takes over.
//
// Invites by email (Supabase sends a real "set your password" email) --
// never sets or sees a password on anyone's behalf.

interface RequestBody {
  password: string;
  emails: string[];
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { password, emails } = (await req.json()) as RequestBody;

    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    if (!password || !adminPassword || password !== adminPassword) {
      return errorResponse("Unauthorized", 401);
    }
    if (!Array.isArray(emails) || emails.length === 0) {
      return errorResponse("emails array is required", 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const results: { email: string; status: string }[] = [];

    for (const email of emails) {
      try {
        const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email);

        let userId: string | undefined = invited?.user?.id;

        if (inviteErr) {
          // Already-registered users can't be re-invited -- look them up
          // instead so the role can still be granted.
          if (inviteErr.message?.toLowerCase().includes("already") || inviteErr.status === 422) {
            const { data: existing } = await supabase.auth.admin.listUsers();
            userId = existing?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
            if (!userId) throw inviteErr;
          } else {
            throw inviteErr;
          }
        }

        if (!userId) throw new Error("No user id after invite/lookup");

        const { error: roleErr } = await supabase
          .from("user_roles")
          .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
        if (roleErr) throw roleErr;

        results.push({ email, status: inviteErr ? "role_granted_existing_user" : "invited" });
      } catch (e) {
        results.push({ email, status: `error: ${e instanceof Error ? e.message : String(e)}` });
      }
    }

    return jsonResponse({ results });
  } catch (err) {
    console.error("provision-admin-user error:", err);
    return errorResponse(err);
  }
});
