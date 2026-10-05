import { supabase } from "@/integrations/supabase/client";

export interface OpenInvitation {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  client_account_id: string;
}

/** Look up one open invitation by its secret token (no session needed). */
export async function fetchInvitationByToken(token: string): Promise<OpenInvitation | null> {
  const { data, error } = await supabase.functions.invoke("get-invitation", { body: { token } });
  if (error) throw error;
  return (data?.invitation as OpenInvitation | null) ?? null;
}

// Flat shape (not a discriminated union): the project doesn't run with strict
// null checks, so `if (!r.ok)` wouldn't narrow a union.
export interface AcceptResult {
  ok: boolean;
  clientAccountId?: string;
  reason?: "no_open_invitation" | "email_mismatch" | "email_unverified" | "already_linked" | "error";
  message?: string;
}

/**
 * Link the signed-in user to the client portal for an open invitation. Runs
 * server-side (accept-invitation) so the browser never needs to write to
 * client_portal_users / user_roles directly. With no token, the server falls
 * back to the caller's most recent open invite by email.
 */
export async function acceptInvitation(token?: string | null): Promise<AcceptResult> {
  const { data, error } = await supabase.functions.invoke("accept-invitation", {
    body: token ? { token } : {},
  });
  if (error) {
    // FunctionsHttpError hides the JSON body in `context`; the 4xx bodies here carry a `reason`.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = await ctx.json();
        if (["no_open_invitation", "email_mismatch", "email_unverified", "already_linked"].includes(body?.reason)) {
          return { ok: false, reason: body.reason };
        }
        return { ok: false, reason: "error", message: body?.error };
      } catch { /* fall through */ }
    }
    return { ok: false, reason: "error", message: error.message };
  }
  if (!data?.success) return { ok: false, reason: "error" };
  return { ok: true, clientAccountId: data.client_account_id as string };
}

/** One place for the visitor-facing wording of every way accepting can fail. */
export function acceptFailureMessage(reason?: AcceptResult["reason"]): string {
  switch (reason) {
    case "email_mismatch":
      return "This invitation was sent to a different email address than the one you're signed in with.";
    case "email_unverified":
      return "Please confirm your email address first (check your inbox for our confirmation link), then open your invitation link again.";
    case "already_linked":
      return "This account is already linked to a different client portal. Please contact your account manager.";
    case "no_open_invitation":
      return "This invitation has already been used or has expired. Please ask your admin to send a new one.";
    default:
      return "We couldn't finish setting up your portal access. Please try again or contact your account manager.";
  }
}
