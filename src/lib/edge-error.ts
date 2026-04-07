/**
 * Unified error extractor for Supabase edge function calls.
 *
 * Handles two failure modes:
 *  1. SDK-level error (network failure, auth error) → `error` param is non-null
 *  2. Edge function returned HTTP 200 but body contains `{ error: "..." }` → `data.error`
 *
 * Returns a human-readable message string, or null if no error detected.
 */
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
 * Maps known HTTP-style error codes to user-friendly messages.
 * Falls back to the raw message if no mapping exists.
 */
export function friendlyEdgeMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("429"))
    return "AI rate limit reached — please wait a moment and try again";
  if (lower.includes("credits exhausted") || lower.includes("402") || lower.includes("quota"))
    return "AI credits exhausted — contact your administrator";
  if (lower.includes("timeout") || lower.includes("timed out"))
    return "The request timed out — please try again";
  if (lower.includes("unauthorized") || lower.includes("401"))
    return "Authentication failed — please log in again";
  return raw;
}
