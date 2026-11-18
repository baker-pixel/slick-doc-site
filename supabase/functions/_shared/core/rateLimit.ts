// Simple per-IP, per-endpoint rate limiting for public unauthenticated
// functions. Same table + timestamp-window-count style as
// discoveryCooldown.ts, keyed by IP instead of client_id.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 5;

export function getClientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || req.headers.get("cf-connecting-ip")
    || "unknown";
}

/**
 * Logs this attempt and reports whether the caller is currently over the
 * limit. Logs before checking so a caller can't dodge the counter by
 * triggering an early-exit path (e.g. a honeypot) on every request.
 */
export async function checkRateLimit(
  supabase: any,
  ipAddress: string,
  endpoint: string,
): Promise<{ limited: boolean }> {
  await supabase.from("signup_rate_limits").insert({ ip_address: ipAddress, endpoint });

  const cutoff = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count } = await supabase
    .from("signup_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("ip_address", ipAddress)
    .eq("endpoint", endpoint)
    .gte("created_at", cutoff);

  return { limited: (count ?? 0) > MAX_REQUESTS };
}
