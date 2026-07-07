// Shared admin auth check: real per-user login (Supabase Auth JWT + admin
// role) is checked first, with the legacy shared ADMIN_PASSWORD as a
// fallback during migration. See supabase/functions/admin/index.ts for the
// original implementation this was extracted from.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AdminAuthResult {
  authorized: boolean;
  userId: string | null;
  via: "session" | "password" | null;
}

export async function checkAdminAuth(
  req: Request,
  supabase: SupabaseClient,
  password?: string | null,
): Promise<AdminAuthResult> {
  let authorizedUserId: string | null = null;
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearerToken = authHeader.replace("Bearer ", "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (bearerToken && bearerToken !== serviceKey) {
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser(bearerToken);
      if (!userErr && userData?.user) {
        const { data: roleRow } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userData.user.id)
          .eq("role", "admin")
          .maybeSingle();
        if (roleRow) authorizedUserId = userData.user.id;
      }
    } catch (e) {
      console.error("Admin JWT auth check failed (falling back to password):", e);
    }
  }

  if (authorizedUserId) {
    return { authorized: true, userId: authorizedUserId, via: "session" };
  }

  const adminPassword = Deno.env.get("ADMIN_PASSWORD");
  const passwordValid = !!password && !!adminPassword && password === adminPassword;
  if (passwordValid) {
    return { authorized: true, userId: null, via: "password" };
  }

  return { authorized: false, userId: null, via: null };
}

/**
 * For endpoints reachable from both the admin panel and the client portal:
 * authorizes an admin (session or password, via checkAdminAuth) OR a signed-in
 * portal user who owns the given client account. Mirrors the inline pattern
 * used in extract-brand-assets/handle-approval before this was extracted.
 */
export async function checkClientOrAdminAuth(
  req: Request,
  supabase: SupabaseClient,
  clientAccountId: string | null | undefined,
  password?: string | null,
): Promise<AdminAuthResult> {
  const adminAuth = await checkAdminAuth(req, supabase, password);
  if (adminAuth.authorized) return adminAuth;

  if (!clientAccountId) return { authorized: false, userId: null, via: null };

  const authHeader = req.headers.get("Authorization") ?? "";
  const bearerToken = authHeader.replace("Bearer ", "");
  if (!bearerToken) return { authorized: false, userId: null, via: null };

  try {
    const { data: userData, error } = await supabase.auth.getUser(bearerToken);
    if (error || !userData?.user) return { authorized: false, userId: null, via: null };

    const { data: portalUser } = await supabase
      .from("client_portal_users")
      .select("id")
      .eq("user_id", userData.user.id)
      .eq("client_account_id", clientAccountId)
      .maybeSingle();

    if (portalUser) return { authorized: true, userId: userData.user.id, via: "session" };
  } catch (e) {
    console.error("Client ownership auth check failed:", e);
  }

  return { authorized: false, userId: null, via: null };
}
