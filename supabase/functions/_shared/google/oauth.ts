// Shared Google OAuth helpers for the GA4 connect flow.
export const GA_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
export const SCOPES = [GA_SCOPE, "openid", "email"];

export const redirectUri = () => `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-oauth-callback`;

const enc = new TextEncoder();
const b64url = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function hmacKey() {
  const secret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET is not configured");
  return crypto.subtle.importKey("raw", enc.encode(`ga-state:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export interface OAuthState { c: string; u: string | null; o: string; exp: number; n: string }

/** Signed, short-lived state so the callback knows which client this is for (and can't be forged). */
export async function signState(s: Omit<OAuthState, "exp" | "n">): Promise<string> {
  const payload: OAuthState = { ...s, exp: Date.now() + 10 * 60_000, n: crypto.randomUUID() };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifyState(state: string | null): Promise<OAuthState | null> {
  if (!state) return null;
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(), unb64url(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(unb64url(body))) as OAuthState;
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

const ALLOWED_HOSTS = new Set(["orangedoormarketing.com", "www.orangedoormarketing.com", "localhost", "127.0.0.1"]);

/** Only ever send the user back to one of our own origins. */
export function safeReturnOrigin(candidate: unknown): string {
  const fallback = Deno.env.get("APP_URL") || "https://orangedoormarketing.com";
  try {
    const u = new URL(String(candidate));
    if (ALLOWED_HOSTS.has(u.hostname) && (u.protocol === "https:" || u.hostname === "localhost" || u.hostname === "127.0.0.1")) return u.origin;
  } catch { /* fall through */ }
  return new URL(fallback).origin;
}

export async function tokenRequest(params: Record<string, string>) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      ...params,
    }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body: j as Record<string, any> };
}
