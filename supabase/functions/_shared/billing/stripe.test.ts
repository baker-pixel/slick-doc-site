import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { tierForPriceId, verifyStripeSignature } from "./stripe.ts";

async function sign(body: string, secret: string, t: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const secret = "whsec_test";
const body = '{"id":"evt_1"}';
const now = 1_800_000_000;

Deno.test("accepts a correctly signed, fresh payload", async () => {
  const v1 = await sign(body, secret, now);
  assertEquals(await verifyStripeSignature(body, `t=${now},v1=${v1}`, secret, 300, now + 10), true);
});

Deno.test("rejects a tampered body, wrong secret, stale timestamp and missing header", async () => {
  const v1 = await sign(body, secret, now);
  assertEquals(await verifyStripeSignature(body + " ", `t=${now},v1=${v1}`, secret, 300, now), false);
  assertEquals(await verifyStripeSignature(body, `t=${now},v1=${v1}`, "whsec_other", 300, now), false);
  assertEquals(await verifyStripeSignature(body, `t=${now},v1=${v1}`, secret, 300, now + 301), false);
  assertEquals(await verifyStripeSignature(body, null, secret, 300, now), false);
});

Deno.test("maps known price ids to tiers", () => {
  assertEquals(tierForPriceId("price_1UPgjKHaqELPL5HRjLhmAYOt"), "growth");
  assertEquals(tierForPriceId("price_unknown"), null);
});
