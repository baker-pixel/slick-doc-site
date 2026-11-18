// Per-IP / per-email / global rate limit for the public Quick Analysis scan.
// Backed by the scan_rate_limits table because edge functions are stateless.
// deno-lint-ignore-file no-explicit-any

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const SCAN_LIMITS = {
  ipPerHour: 10,
  ipPerDay: 30,
  emailPerHour: 3,
  emailPerDay: 10,
  globalPerHour: 200, // circuit breaker on total anonymous scans (AI + scraping cost)
};

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; scope: "ip" | "email" | "global"; retryAfterMinutes: number };

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();
  return ip || null;
}

async function count(supabase: any, column: "ip_hash" | "email" | null, value: string | null, sinceMs: number) {
  let q = supabase
    .from("scan_rate_limits")
    .select("id", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - sinceMs).toISOString());
  if (column && value) q = q.eq(column, value);
  const { count: n } = await q;
  return n ?? 0;
}

/**
 * Checks the limits and, if allowed, records this attempt. Fails open on a
 * database error: a broken limiter must never take the lead-gen form down.
 */
export async function checkScanRateLimit(
  supabase: any,
  req: Request,
  email: string | null,
): Promise<RateLimitResult> {
  try {
    const ip = clientIp(req);
    const salt = Deno.env.get("RATE_LIMIT_SALT") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const ipHash = ip ? await sha256Hex(`${salt}:${ip}`) : null;
    const normEmail = email ? email.trim().toLowerCase() : null;

    if ((await count(supabase, null, null, HOUR_MS)) >= SCAN_LIMITS.globalPerHour) {
      return { allowed: false, scope: "global", retryAfterMinutes: 30 };
    }
    if (ipHash) {
      if ((await count(supabase, "ip_hash", ipHash, HOUR_MS)) >= SCAN_LIMITS.ipPerHour) {
        return { allowed: false, scope: "ip", retryAfterMinutes: 60 };
      }
      if ((await count(supabase, "ip_hash", ipHash, DAY_MS)) >= SCAN_LIMITS.ipPerDay) {
        return { allowed: false, scope: "ip", retryAfterMinutes: 24 * 60 };
      }
    }
    if (normEmail) {
      if ((await count(supabase, "email", normEmail, HOUR_MS)) >= SCAN_LIMITS.emailPerHour) {
        return { allowed: false, scope: "email", retryAfterMinutes: 60 };
      }
      if ((await count(supabase, "email", normEmail, DAY_MS)) >= SCAN_LIMITS.emailPerDay) {
        return { allowed: false, scope: "email", retryAfterMinutes: 24 * 60 };
      }
    }

    await supabase.from("scan_rate_limits").insert({ ip_hash: ipHash, email: normEmail });

    // Housekeeping: ~1% of requests prune rows older than 2 days.
    if (Math.random() < 0.01) {
      await supabase.from("scan_rate_limits").delete().lt("created_at", new Date(Date.now() - 2 * DAY_MS).toISOString());
    }
    return { allowed: true };
  } catch (e) {
    console.error("scan rate limit check failed (allowing):", e);
    return { allowed: true };
  }
}
