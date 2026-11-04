import { supabase } from "@/integrations/supabase/client";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";

const SESSION_ENDED_MSG =
  "Your admin session is no longer valid (the password may have been changed) — please sign in again.";

// AdminAuthContext registers this so a rejected session sends the user back to
// the login screen once, instead of every panel failing separately.
let unauthorizedHandler: (() => void) | null = null;
export function setAdminUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn;
}

/** The Supabase SDK exposes the failed Response on error.context. */
function isHttp401(error: unknown): boolean {
  const ctx = (error as { context?: { status?: number } } | null)?.context;
  return ctx?.status === 401;
}

/**
 * Calls the admin edge function with automatic password injection and
 * structured error extraction. Returns `{ data, error }` where `error`
 * is a user-friendly string or null.
 */
export async function callAdminApi<T = unknown>(
  password: string,
  body: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null }> {
  if (!password) {
    return { data: null, error: "Admin session expired — please log in again" };
  }

  try {
    const { data, error } = await supabase.functions.invoke("admin", {
      body: { ...body, password },
    });

    // A 401 on anything other than the login call means the stored session
    // credentials were rejected (e.g. ADMIN_PASSWORD rotated): end the session.
    if (error && body.action !== "authenticate" && isHttp401(error)) {
      unauthorizedHandler?.();
      return { data: null, error: SESSION_ENDED_MSG };
    }

    const errMsg = await getEdgeErrorMessage(error, data);
    if (errMsg) {
      return { data: null, error: friendlyEdgeMessage(errMsg) };
    }

    return { data: data as T, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { data: null, error: friendlyEdgeMessage(msg) };
  }
}
