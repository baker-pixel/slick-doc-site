import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { DISCOVERY_NURTURE_HOLD_MS, nurtureStartAt, readyForNurture, stepDelayDays } from "./dripSchedule.ts";

const approved = "2026-10-12T09:48:09.732Z";
const now = new Date("2026-10-12T10:00:00Z"); // 12 minutes after approval
const campaign = { campaign_id: "c1", approved_at: approved };
const discovery = { campaign_id: null, approved_at: approved };

Deno.test("campaign lead enters nurture at the next run, no 48h hold", () => {
  assertEquals(readyForNurture(campaign, now), true);
});

Deno.test("discovery lead still waits the 48h review hold", () => {
  assertEquals(readyForNurture(discovery, now), false);
  assertEquals(readyForNurture(discovery, new Date(new Date(approved).getTime() + DISCOVERY_NURTURE_HOLD_MS)), true);
  assertEquals(readyForNurture(discovery, new Date(new Date(approved).getTime() + DISCOVERY_NURTURE_HOLD_MS - 1)), false);
});

Deno.test("unapproved prospect is never ready", () => {
  assertEquals(readyForNurture({ campaign_id: "c1", approved_at: null }, now), false);
  assertEquals(readyForNurture({ campaign_id: null, approved_at: null }, now), false);
});

Deno.test("sequence clock: campaign starts at approval, discovery +48h", () => {
  assertEquals(nurtureStartAt(campaign).toISOString(), approved);
  assertEquals(nurtureStartAt(discovery).toISOString(), "2026-10-14T09:48:09.732Z");
});

Deno.test("campaign step 1 has no delay; later steps keep their spacing", () => {
  const configured = [2, 3, 5, 7];
  assertEquals(configured.map((d, i) => stepDelayDays(campaign, i, d)), [0, 3, 5, 7]);
  assertEquals(configured.map((d, i) => stepDelayDays(discovery, i, d)), [2, 3, 5, 7]);
});

Deno.test("campaign emails land on day 0, 3, 8, 15", () => {
  const configured = [2, 3, 5, 7];
  let cum = 0;
  const days = configured.map((d, i) => (cum += stepDelayDays(campaign, i, d)));
  assertEquals(days, [0, 3, 8, 15]);
});

Deno.test("missing configured delay counts as zero", () => {
  assertEquals(stepDelayDays(discovery, 1, undefined), 0);
  assertEquals(stepDelayDays(discovery, 1, null), 0);
});
