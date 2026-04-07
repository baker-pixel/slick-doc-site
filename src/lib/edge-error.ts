/**
 * Unified error extractor for Supabase edge function calls.
 *
 * Handles three failure modes:
 *  1. SDK-level FunctionsHttpError (non-2xx response) → extracts the JSON body
 *  2. SDK-level error (network failure, auth error) → `error` param is non-null
 *  3. Edge function returned HTTP 200 but body contains `{ error: "..." }` → `data.error`
 *
 * Returns a human-readable message string, or null if no error detected.
 */
export async function extractEdgeBody(error: unknown): Promise<string | null> {
  // Supabase SDK wraps non-2xx responses in FunctionsHttpError with a .context property
  // that is a Response object we can read
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    // FunctionsHttpError has a `context` property that is a Response
    if (e.context && typeof (e.context as Response).json === "function") {
      try {
        const body = await (e.context as Response).json();
        if (body?.error) {
          const details = body.details;
          if (details?.message) return details.message;
          return typeof body.error === "string" ? body.error : JSON.stringify(body.error);
        }
        if (body?.message) return body.message;
        return JSON.stringify(body);
      } catch {
        // Response already consumed or not JSON — fall through
      }
    }
  }
  return null;
}

export function handleEdgeError(
  error: unknown,
  data: unknown,
): string | null {
  // 1. SDK / network error
  if (error) {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    if (typeof error === "object") {
      const e = error as Record<string, unknown>;
      return (
        (e.message as string) ||
        (e.error_description as string) ||
        (e.details as string) ||
        (e.hint as string) ||
        JSON.stringify(e)
      );
    }
    return String(error);
  }

  // 2. Edge function returned an error in its response body
  if (data && typeof data === "object" && "error" in data) {
    const msg = (data as Record<string, unknown>).error;
    if (msg) return typeof msg === "string" ? msg : JSON.stringify(msg);
  }

  return null;
}

/**
 * Full error extraction: tries to read the response body from FunctionsHttpError first,
 * then falls back to handleEdgeError. Use this for all edge function calls.
 */
export async function getEdgeErrorMessage(
  error: unknown,
  data: unknown,
): Promise<string | null> {
  // Try to extract the body from a non-2xx FunctionsHttpError first
  const bodyMsg = await extractEdgeBody(error);
  if (bodyMsg) return bodyMsg;

  // Fall back to synchronous extraction
  return handleEdgeError(error, data);
}

/**
 * Maps known HTTP-style error codes to user-friendly messages.
 * Falls back to the raw message if no mapping exists.
 */
export function friendlyEdgeMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("unauthorized") || lower.includes("401"))
    return "Admin session expired — please log in again";
  if (lower.includes("rate limit") || lower.includes("429"))
    return "Rate limit reached — please wait a moment and try again";
  if (lower.includes("credits exhausted") || lower.includes("402") || lower.includes("quota"))
    return "AI credits exhausted — contact your administrator";
  if (lower.includes("timeout") || lower.includes("timed out"))
    return "The request timed out — please try again";
  if (lower.includes("domain is not verified"))
    return "Email domain not verified — contact your administrator to configure email sending";
  if (lower.includes("failed to fetch") || lower.includes("networkerror"))
    return "Network error — check your internet connection and try again";
  return raw;
}
