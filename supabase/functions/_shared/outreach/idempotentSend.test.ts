import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  contentSendKey,
  deterministicUuid,
  isRetryableSendError,
  queueSendKey,
  ResendSendError,
  sendWithIdempotency,
} from "./idempotentSend.ts";

const payload = { from: "a@x.com", to: ["b@y.com"], subject: "s", html: "<p>h</p>" };

/** A fake Resend that remembers keys like the real one: same key+payload replays, else 409. */
function fakeResend() {
  const seen = new Map<string, { body: string; id: string }>();
  let sends = 0;
  let inFlight = false;
  const fetchImpl = ((_url: string, init: RequestInit) => {
    const key = (init.headers as Record<string, string>)["Idempotency-Key"];
    const body = String(init.body);
    if (inFlight) return Promise.resolve(new Response(JSON.stringify({ name: "concurrent_idempotent_requests", message: "in progress" }), { status: 409 }));
    const prior = seen.get(key);
    if (prior) {
      if (prior.body !== body) return Promise.resolve(new Response(JSON.stringify({ name: "invalid_idempotent_request", message: "different payload" }), { status: 409 }));
      return Promise.resolve(new Response(JSON.stringify({ id: prior.id }), { status: 200 }));
    }
    sends++;
    const id = `email_${sends}`;
    seen.set(key, { body, id });
    return Promise.resolve(new Response(JSON.stringify({ id }), { status: 200 }));
  }) as unknown as typeof fetch;
  return { fetchImpl, sends: () => sends, setInFlight: (v: boolean) => (inFlight = v) };
}

Deno.test("crash after send, then reaper resends with the same key: exactly one email goes out", async () => {
  const r = fakeResend();
  const key = queueSendKey("row-1", 0);
  const first = await sendWithIdempotency({ apiKey: "k", key, payload, fetchImpl: r.fetchImpl });
  // ...worker dies before recording the send; reaper re-queues (reap_count is NOT in the key)...
  const again = await sendWithIdempotency({ apiKey: "k", key: queueSendKey("row-1", 0), payload, fetchImpl: r.fetchImpl });
  assertEquals(r.sends(), 1);
  assertEquals(again.id, first.id);
});

Deno.test("a known failure moves to a new key (retry count), so it is a fresh send", async () => {
  const r = fakeResend();
  await sendWithIdempotency({ apiKey: "k", key: queueSendKey("row-1", 0), payload, fetchImpl: r.fetchImpl });
  await sendWithIdempotency({ apiKey: "k", key: queueSendKey("row-1", 1), payload, fetchImpl: r.fetchImpl });
  assertEquals(r.sends(), 2);
});

Deno.test("a different payload under the same key is an error, never a silent second send", async () => {
  const r = fakeResend();
  const key = queueSendKey("row-1", 0);
  await sendWithIdempotency({ apiKey: "k", key, payload, fetchImpl: r.fetchImpl });
  const e = await assertRejects(
    () => sendWithIdempotency({ apiKey: "k", key, payload: { ...payload, html: "<p>other</p>" }, fetchImpl: r.fetchImpl }),
    ResendSendError,
  );
  assertEquals(e.code, "invalid_idempotent_request");
  assertEquals(r.sends(), 1);
  assertEquals(isRetryableSendError(e), false); // retrying is useless, surface it
});

Deno.test("concurrent request is retryable", async () => {
  const r = fakeResend();
  r.setInFlight(true);
  const e = await assertRejects(() => sendWithIdempotency({ apiKey: "k", key: "x", payload, fetchImpl: r.fetchImpl }), ResendSendError);
  assert(isRetryableSendError(e));
});

Deno.test("deterministic uuid: same seed same id, different seed different id, uuid-shaped", async () => {
  const a = await deterministicUuid("email-queue:row-1:r0");
  assertEquals(a, await deterministicUuid("email-queue:row-1:r0"));
  assert(a !== await deterministicUuid("email-queue:row-1:r1"));
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(a));
});

Deno.test("keys are stable and bounded", () => {
  assertEquals(queueSendKey("abc", 2), "email-queue:abc:r2");
  assertEquals(contentSendKey("abc", 1), "content-calendar:abc:a1");
});

Deno.test("an over-long key is refused before any network call", async () => {
  await assertRejects(() => sendWithIdempotency({ apiKey: "k", key: "x".repeat(257), payload, fetchImpl: (() => { throw new Error("must not fetch"); }) as unknown as typeof fetch }));
});
