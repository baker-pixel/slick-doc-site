// Idempotent Resend sends (eng-review fix IDEM-1 / R2).
//
// Problem: process-email-queue and publish-scheduled-content did "send, then record".
// A crash or timeout between the two made the reaper / the 15-minute reset think the
// send never happened and send it again: duplicate email to a prospect or client.
//
// Resend dedupes when the SAME `Idempotency-Key` header arrives with the SAME payload
// within 24h (docs: https://resend.com/docs/dashboard/emails/idempotency-keys):
//   same key + same payload     -> original response, no second email
//   same key + different payload-> 409 invalid_idempotent_request
//   same key while in flight    -> 409 concurrent_idempotent_requests (safe to retry later)
// The docs do not say whether a FAILED send consumes the key, so callers must put the
// retry/attempt number in the key (a known failure moves to a new key; a crash does not).
// And the payload must be byte-identical across a crash-retry, so anything random in it
// (tracking ids) has to be derived from the row, see deterministicUuid().

export interface ResendPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
  reply_to?: string;
  headers?: Record<string, string>;
}

export class ResendSendError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Resend error `name`, e.g. concurrent_idempotent_requests. */
    readonly code: string | undefined,
  ) {
    super(message);
  }
}

/** Idempotency key for one attempt at one queue row. Retry count, never reap count. */
export function queueSendKey(queueId: string, retryCount: number): string {
  return `email-queue:${queueId}:r${retryCount}`;
}

/** Idempotency key for one attempt at one scheduled content item. */
export function contentSendKey(itemId: string, attempt: number): string {
  return `content-calendar:${itemId}:a${attempt}`;
}

/**
 * A UUID derived from a seed (SHA-256, formatted as a v4-shaped UUID) so a retry of
 * the same send builds the same tracking pixel and links, and Resend sees an
 * identical payload.
 */
export async function deterministicUuid(seed: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed)));
  const b = digest.slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4 shape
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export interface SendOptions {
  apiKey: string;
  key: string;
  payload: ResendPayload;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * POSTs to Resend with an Idempotency-Key and a hard timeout. Returns the email id.
 * Throws ResendSendError on any non-2xx (the caller's retry/backoff handles it).
 */
export async function sendWithIdempotency(opts: SendOptions): Promise<{ id: string | null }> {
  if (!opts.key || opts.key.length > 256) throw new Error("idempotency key must be 1-256 characters");
  const f = opts.fetchImpl ?? fetch;
  const res = await f("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": opts.key,
    },
    body: JSON.stringify(opts.payload),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
  });
  // deno-lint-ignore no-explicit-any
  let body: any = null;
  try { body = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const code: string | undefined = body?.name;
    throw new ResendSendError(`Resend ${res.status}${code ? ` ${code}` : ""}: ${body?.message ?? "send failed"}`, res.status, code);
  }
  return { id: body?.id ?? null };
}

/** True for Resend errors where trying again later is correct and safe. */
export function isRetryableSendError(e: unknown): boolean {
  if (!(e instanceof ResendSendError)) return true; // network/timeout: retry, the key makes it safe
  if (e.code === "concurrent_idempotent_requests") return true;
  return e.status === 429 || e.status >= 500;
}
