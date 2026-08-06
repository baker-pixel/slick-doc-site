// Shared HTTP helpers for edge functions. Single source of truth for CORS.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Returns a CORS preflight response for OPTIONS requests, or null otherwise. */
export function handleOptions(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

/** JSON response with CORS headers applied. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Standard error response; accepts Error, string, or a Postgres/Supabase error object ({ message, code, ... }). */
export function errorResponse(err: unknown, status = 500): Response {
  const message = err instanceof Error
    ? err.message
    : typeof err === "string"
    ? err
    : typeof (err as { message?: unknown })?.message === "string"
    ? (err as { message: string }).message
    : "Unknown error";
  return jsonResponse({ error: message }, status);
}
