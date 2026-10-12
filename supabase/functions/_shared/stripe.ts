// Minimal Stripe REST client (fetch, no SDK) + webhook signature check.
// The secret key lives only in the STRIPE_SECRET_KEY Supabase secret.

const STRIPE_API = "https://api.stripe.com/v1";

export type PlanTier = "foundation" | "growth" | "transformation";

// Sandbox price IDs; override per environment with STRIPE_PRICE_<TIER> secrets
// when switching to live mode.
const DEFAULT_PRICE_IDS: Record<PlanTier, string> = {
  foundation: "price_1UNwYnHaqELPL5HRoGaZGZvO",
  growth: "price_1UPgjKHaqELPL5HRjLhmAYOt",
  transformation: "price_1UPgk0HaqELPL5HRCEhpBjnI",
};

export function priceIdForTier(tier: PlanTier): string {
  return Deno.env.get(`STRIPE_PRICE_${tier.toUpperCase()}`) ?? DEFAULT_PRICE_IDS[tier];
}

export function tierForPriceId(priceId: string | null | undefined): PlanTier | null {
  if (!priceId) return null;
  for (const tier of Object.keys(DEFAULT_PRICE_IDS) as PlanTier[]) {
    if (priceIdForTier(tier) === priceId) return tier;
  }
  return null;
}

/** Stripe's form encoding: nested objects as a[b], arrays as a[0]. */
function encodeForm(params: Record<string, unknown>, prefix = "", out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === "object") encodeForm(item as Record<string, unknown>, `${key}[${i}]`, out);
        else out.append(`${key}[${i}]`, String(item));
      });
    } else if (typeof v === "object") {
      encodeForm(v as Record<string, unknown>, key, out);
    } else {
      out.append(key, String(v));
    }
  }
  return out;
}

export async function stripeRequest<T = any>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  params: Record<string, unknown> = {},
  opts: { idempotencyKey?: string } = {},
): Promise<T> {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");

  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  let url = `${STRIPE_API}${path}`;
  let body: string | undefined;
  const form = encodeForm(params);
  if (method === "GET") {
    if (form.toString()) url += `?${form}`;
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = form.toString();
  }

  const res = await fetch(url, { method, headers, body });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Stripe ${res.status}: ${json?.error?.message ?? JSON.stringify(json)}`);
  }
  return json as T;
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verifies a Stripe-Signature header (t=...,v1=...) against the raw body.
 * Rejects stale timestamps to blunt replays.
 */
export async function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const timestamp = parts.find(([k]) => k === "t")?.[1];
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!timestamp || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`)));
  return signatures.some((s) => timingSafeEqual(s, expected));
}
