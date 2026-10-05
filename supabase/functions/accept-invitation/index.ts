import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, jsonResponse, errorResponse } from "../_shared/http.ts";

// Links the signed-in user to a client portal from an open invitation. This
// used to be done from the browser with direct inserts into
// client_portal_users / user_roles, which needed RLS policies broad enough for
// any signed-in user to join any client or grant themselves any role. Here the
// service role does it, and only after proving the caller's verified auth
// email matches the invitation's email.
//
// Body: { token?: string }. With a token, that exact invite is used. Without
// one (self-heal after a confirmation link opened on another device), the
// caller's most recent open invite by email is used.
// ilike treats % and _ as wildcards, and "_" is common in real addresses
// (jo_hn@x.com would also match joXhn@x.com). Escape them for an exact match.
const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!bearer) return errorResponse("Unauthorized", 401);
    const { data: userData, error: userErr } = await supabase.auth.getUser(bearer);
    const user = userData?.user;
    if (userErr || !user?.email) return errorResponse("Unauthorized", 401);

    // The invite is matched to the caller by email, so that email must be one
    // the caller has actually proven they control. Without this, anyone could
    // sign up with someone else's address and claim that person's invitation.
    if (!user.email_confirmed_at) {
      return jsonResponse({ success: false, reason: "email_unverified" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === "string" && body.token ? body.token : null;

    let query = supabase
      .from("client_invitations")
      .select("id, email, first_name, last_name, client_account_id")
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString());
    query = token
      ? query.eq("token", token)
      : query.ilike("email", escapeLike(user.email)).order("created_at", { ascending: false }).limit(1);

    const { data: invite, error: inviteErr } = await query.maybeSingle();
    if (inviteErr) throw inviteErr;
    if (!invite) return jsonResponse({ success: false, reason: "no_open_invitation" }, 404);

    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      return jsonResponse({ success: false, reason: "email_mismatch", invitedEmail: invite.email }, 403);
    }

    const now = new Date().toISOString();
    // client_portal_users.user_id is UNIQUE: a user belongs to one client. If
    // they're already linked to a DIFFERENT client, don't pretend this worked
    // (and don't burn the invitation).
    const { data: existing } = await supabase
      .from("client_portal_users")
      .select("id, client_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing && existing.client_account_id !== invite.client_account_id) {
      return jsonResponse({ success: false, reason: "already_linked" }, 409);
    }

    if (existing) {
      await supabase.from("client_portal_users").update({ last_login_at: now }).eq("id", existing.id);
    } else {
      const { error: insErr } = await supabase.from("client_portal_users").insert({
        user_id: user.id,
        client_account_id: invite.client_account_id,
        first_name: invite.first_name,
        last_name: invite.last_name,
        invited_by: "admin",
        last_login_at: now,
      });
      if (insErr) {
        // 23505 = a concurrent accept got there first. Only fine if it linked
        // this same client; otherwise it's the already_linked case above.
        if (insErr.code !== "23505") throw insErr;
        const { data: raced } = await supabase
          .from("client_portal_users")
          .select("client_account_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (raced?.client_account_id !== invite.client_account_id) {
          return jsonResponse({ success: false, reason: "already_linked" }, 409);
        }
      }
    }

    const { error: roleErr } = await supabase
      .from("user_roles")
      .upsert({ user_id: user.id, role: "client" }, { onConflict: "user_id,role" });
    if (roleErr) throw roleErr;

    await supabase.from("client_invitations").update({ accepted_at: now }).eq("id", invite.id);

    return jsonResponse({ success: true, client_account_id: invite.client_account_id });
  } catch (err) {
    console.error("accept-invitation failed:", err);
    return errorResponse(err);
  }
});
