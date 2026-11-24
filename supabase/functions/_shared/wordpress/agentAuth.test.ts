import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { canonicalString, checkSignedRequest, timestampFresh, validNonce, verifySignature } from "./agentAuth.ts";

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function makeKeypair() {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { priv: pair.privateKey, pubB64: b64(raw) };
}

async function sign(priv: CryptoKey, message: string): Promise<string> {
  return b64(new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, priv, new TextEncoder().encode(message))));
}

const NOW = 1_800_000_000;
const NONCE = "abcdefghijklmnop1234";

async function signedRequest(overrides: { body?: string; path?: string; ts?: string } = {}) {
  const { priv, pubB64 } = await makeKeypair();
  const body = '{"action":"heartbeat"}';
  const ts = String(NOW);
  const message = await canonicalString("POST", "/functions/v1/site-agent", ts, NONCE, body);
  const signature = await sign(priv, message);
  return {
    pubB64,
    opts: {
      method: "POST",
      path: overrides.path ?? "/functions/v1/site-agent",
      body: overrides.body ?? body,
      headers: { siteId: "s", timestamp: overrides.ts ?? ts, nonce: NONCE, signature },
      publicKeyB64: pubB64,
      nowSeconds: NOW,
    },
  };
}

Deno.test("a correctly signed request passes", async () => {
  const { opts } = await signedRequest();
  assertEquals(await checkSignedRequest(opts), null);
});

Deno.test("changing the body, the path or the timestamp breaks the signature", async () => {
  assertEquals(await checkSignedRequest((await signedRequest({ body: '{"action":"pull"}' })).opts), "bad_signature");
  assertEquals(await checkSignedRequest((await signedRequest({ path: "/functions/v1/other" })).opts), "bad_signature");
  assertEquals(await checkSignedRequest((await signedRequest({ ts: String(NOW + 1) })).opts), "bad_signature");
});

Deno.test("a signature from a different key is rejected", async () => {
  const { opts } = await signedRequest();
  const other = await makeKeypair();
  assertEquals(await checkSignedRequest({ ...opts, publicKeyB64: other.pubB64 }), "bad_signature");
});

Deno.test("old and future timestamps are rejected", async () => {
  const { opts } = await signedRequest();
  assertEquals(await checkSignedRequest({ ...opts, nowSeconds: NOW + 301 }), "stale_timestamp");
  assertEquals(await checkSignedRequest({ ...opts, nowSeconds: NOW - 301 }), "stale_timestamp");
  assertEquals(await checkSignedRequest({ ...opts, nowSeconds: NOW + 299 }), null);
});

Deno.test("missing headers, junk nonces and malformed keys fail without throwing", async () => {
  const { opts } = await signedRequest();
  assertEquals(await checkSignedRequest({ ...opts, headers: { ...opts.headers, signature: null } }), "missing_headers");
  assertEquals(await checkSignedRequest({ ...opts, headers: { ...opts.headers, nonce: "x'; drop" } }), "bad_nonce");
  assertEquals(await verifySignature("not base64 !!", "also bad", "msg"), false);
  assertEquals(await verifySignature(btoa("short"), btoa("short"), "msg"), false);
});

Deno.test("timestamp and nonce validators", () => {
  assert(timestampFresh("1800000000", 1_800_000_100));
  assert(!timestampFresh("abc", 1_800_000_100));
  assert(validNonce("abcdefghijklmnop"));
  assert(!validNonce("short"));
});
