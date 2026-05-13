import { supabase } from "@/integrations/supabase/client";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";

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
