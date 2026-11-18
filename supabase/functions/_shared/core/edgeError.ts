// FunctionsHttpError's `.message` is the Supabase SDK's generic placeholder
// ("Edge Function returned a non-2xx status code") -- it never contains the
// callee's actual error. The real message is in the response body on
// `.context`. Same extraction the frontend does in src/lib/edge-error.ts.
export async function extractEdgeBody(error: unknown): Promise<string | null> {
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
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
        // Response already consumed or not JSON -- fall through
      }
    }
  }
  return null;
}
