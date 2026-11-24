// Request signing for the WordPress site agent (plugin v2).
//
// The plugin holds an Ed25519 private key that never leaves the site; we only
// store the public key. Every request is signed over
//
//   METHOD \n PATH \n TIMESTAMP \n NONCE \n sha256_hex(BODY)
//
// so a signature cannot be reused for another path, another body, or later.
// Pure functions only -- the edge function owns the database (nonce replay check).

export const MAX_CLOCK_SKEW_SECONDS = 300;

export interface SignedHeaders {
  siteId: string | null;
  timestamp: string | null;
  nonce: string | null;
  signature: string | null;
}

export function readSignedHeaders(headers: Headers): SignedHeaders {
  return {
    siteId: headers.get("x-od-site"),
    timestamp: headers.get("x-od-timestamp"),
    nonce: headers.get("x-od-nonce"),
    signature: headers.get("x-od-signature"),
  };
}

const enc = new TextEncoder();
// Deno's lib types make TextEncoder output a generic ArrayBufferLike view, which WebCrypto's
// BufferSource rejects. The bytes are a plain ArrayBuffer at runtime.
const utf8 = (text: string) => enc.encode(text) as Uint8Array<ArrayBuffer>;

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", utf8(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The exact text that is signed. The plugin builds the same string. */
export async function canonicalString(method: string, path: string, timestamp: string, nonce: string, body: string): Promise<string> {
  return [method.toUpperCase(), path, timestamp, nonce, await sha256Hex(body)].join("\n");
}

/** True when `timestamp` (unix seconds) is within the allowed skew of `nowSeconds`. */
export function timestampFresh(timestamp: string, nowSeconds: number, skew = MAX_CLOCK_SKEW_SECONDS): boolean {
  if (!/^\d{9,12}$/.test(timestamp)) return false;
  return Math.abs(nowSeconds - Number(timestamp)) <= skew;
}

/** Nonces are stored as primary keys, so keep them small and boring. */
export function validNonce(nonce: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(nonce);
}

/** Verify a detached Ed25519 signature. Never throws: bad input is just "false". */
export async function verifySignature(publicKeyB64: string, signatureB64: string, message: string): Promise<boolean> {
  try {
    const keyBytes = b64ToBytes(publicKeyB64);
    const sig = b64ToBytes(signatureB64);
    if (keyBytes.length !== 32 || sig.length !== 64) return false;
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, sig, utf8(message));
  } catch {
    return false;
  }
}

export type AuthFailure = "missing_headers" | "stale_timestamp" | "bad_nonce" | "bad_signature";

/**
 * Everything except the replay check, which needs the database. Returns null
 * when the request is correctly signed, otherwise why it is not.
 */
export async function checkSignedRequest(opts: {
  method: string;
  path: string;
  body: string;
  headers: SignedHeaders;
  publicKeyB64: string;
  nowSeconds?: number;
}): Promise<AuthFailure | null> {
  const { timestamp, nonce, signature } = opts.headers;
  if (!timestamp || !nonce || !signature) return "missing_headers";
  if (!timestampFresh(timestamp, opts.nowSeconds ?? Math.floor(Date.now() / 1000))) return "stale_timestamp";
  if (!validNonce(nonce)) return "bad_nonce";
  const message = await canonicalString(opts.method, opts.path, timestamp, nonce, opts.body);
  return (await verifySignature(opts.publicKeyB64, signature, message)) ? null : "bad_signature";
}
