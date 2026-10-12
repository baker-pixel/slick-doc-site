import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { billingDecision, GRACE_DAYS, isEntitled } from "./billingGate.ts";

const now = new Date("2026-10-12T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();
const acct = (o: Partial<Parameters<typeof billingDecision>[0]> = {}) => ({
  status: "active",
  subscription_status: "active",
  payment_failed_at: null,
  paused_for_billing: false,
  ...o,
});

Deno.test("active and trialing are entitled", () => {
  assertEquals(isEntitled(acct(), now), true);
  assertEquals(isEntitled(acct({ subscription_status: "trialing" }), now), true);
});

Deno.test("past_due is entitled inside the grace window, not after", () => {
  assertEquals(isEntitled(acct({ subscription_status: "past_due", payment_failed_at: daysAgo(GRACE_DAYS - 0.5) }), now), true);
  assertEquals(isEntitled(acct({ subscription_status: "past_due", payment_failed_at: daysAgo(GRACE_DAYS + 0.5) }), now), false);
});

Deno.test("past_due without a failure stamp does not pause", () => {
  assertEquals(isEntitled(acct({ subscription_status: "past_due" }), now), true);
});

Deno.test("never-subscribed, unpaid and canceled accounts are not entitled", () => {
  for (const s of ["none", "incomplete", "unpaid", "canceled", "paused"]) {
    assertEquals(isEntitled(acct({ subscription_status: s }), now), false);
  }
});

Deno.test("lapsed active account is paused", () => {
  assertEquals(billingDecision(acct({ subscription_status: "unpaid" }), now), "pause");
  assertEquals(billingDecision(acct({ subscription_status: "none" }), now), "pause");
});

Deno.test("paid account paused for billing resumes", () => {
  assertEquals(billingDecision(acct({ status: "paused", paused_for_billing: true }), now), "resume");
});

Deno.test("manual admin pause is never auto-resumed", () => {
  assertEquals(billingDecision(acct({ status: "paused", paused_for_billing: false }), now), "none");
});

Deno.test("pending and cancelled accounts are left alone", () => {
  assertEquals(billingDecision(acct({ status: "pending", subscription_status: "none" }), now), "none");
  assertEquals(billingDecision(acct({ status: "cancelled", subscription_status: "canceled" }), now), "none");
});
