import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { EXISTING_CLIENT_SKIP_REASON, existingClientDisposition, pipelineOnly } from "./campaignBoundary.ts";

Deno.test("pipeline lead matching a client account is a real conversion", () => {
  assertEquals(existingClientDisposition({ campaign_id: null }), { status: "converted", recordConversion: true });
  assertEquals(existingClientDisposition({}), { status: "converted", recordConversion: true });
});

Deno.test("campaign contact matching a client account is skipped, never a conversion", () => {
  assertEquals(existingClientDisposition({ campaign_id: "c1" }), {
    status: "rejected",
    recordConversion: false,
    reason: EXISTING_CLIENT_SKIP_REASON,
  });
});

Deno.test("pipelineOnly filters to campaign_id IS NULL", () => {
  const calls: unknown[][] = [];
  const q = { is: (...a: unknown[]) => { calls.push(a); return q; } };
  pipelineOnly(q);
  assertEquals(calls, [["campaign_id", null]]);
});
