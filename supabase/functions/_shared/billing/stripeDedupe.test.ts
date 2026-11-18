import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideClaim, isDuplicateSubscription, STALE_CLAIM_MS } from "./stripeDedupe.ts";

const live = { stripe_subscription_id: "sub_1", subscription_status: "active" };

Deno.test("a second paid subscription on a live account is a duplicate", () => {
  assertEquals(isDuplicateSubscription(live, { id: "sub_2", status: "active" }), true);
  assertEquals(isDuplicateSubscription(live, { id: "sub_2", status: "trialing" }), true);
  assertEquals(isDuplicateSubscription({ ...live, subscription_status: "past_due" }, { id: "sub_2", status: "active" }), true);
});

Deno.test("events for the account's own subscription are never duplicates", () => {
  assertEquals(isDuplicateSubscription(live, { id: "sub_1", status: "active" }), false);
});

Deno.test("an unpaid/incomplete second session is not (yet) a duplicate", () => {
  assertEquals(isDuplicateSubscription(live, { id: "sub_2", status: "incomplete" }), false);
});

Deno.test("resubscribing after cancellation is allowed", () => {
  assertEquals(isDuplicateSubscription({ stripe_subscription_id: "sub_1", subscription_status: "canceled" }, { id: "sub_2", status: "active" }), false);
  assertEquals(isDuplicateSubscription({ stripe_subscription_id: null, subscription_status: "none" }, { id: "sub_2", status: "active" }), false);
});

Deno.test("claim decisions", () => {
  const now = Date.parse("2026-10-12T12:00:00Z");
  const at = (msAgo: number) => new Date(now - msAgo).toISOString();
  assertEquals(decideClaim(null, now), "process");
  assertEquals(decideClaim({ completed_at: at(1000), processed_at: at(2000) }, now), "duplicate");
  assertEquals(decideClaim({ completed_at: null, processed_at: at(10_000) }, now), "in_progress");
  assertEquals(decideClaim({ completed_at: null, processed_at: at(STALE_CLAIM_MS + 1000) }, now), "take_over");
});
