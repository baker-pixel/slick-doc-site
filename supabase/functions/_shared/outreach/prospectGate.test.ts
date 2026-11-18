import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { DEFAULT_MIN_FIT, gateVerdict, isDroppable, minFitFor, normalizeUrl } from "./prospectGate.ts";

Deno.test("a score at or above the threshold is kept, below is dropped", () => {
  assertEquals(gateVerdict(90, 0, 60), "keep");
  assertEquals(gateVerdict(60, 0, 60), "keep");
  assertEquals(gateVerdict(59, 0, 60), "drop");
  assertEquals(gateVerdict(0, 0, 60), "drop");
});

Deno.test("an unknown score is retried once, then given up on", () => {
  assertEquals(gateVerdict(null, 0, 60), "retry");
  assertEquals(gateVerdict(null, 1, 60), "drop_unscorable");
  assertEquals(gateVerdict(null, 5, 60), "drop_unscorable");
});

Deno.test("the threshold is per client with a safe default", () => {
  assertEquals(minFitFor(null), DEFAULT_MIN_FIT);
  assertEquals(minFitFor({}), DEFAULT_MIN_FIT);
  assertEquals(minFitFor({ min_fit: 75 }), 75);
  assertEquals(minFitFor({ min_fit: 0 }), DEFAULT_MIN_FIT); // 0 would disable the gate by accident
  assertEquals(minFitFor({ min_fit: 500 }), DEFAULT_MIN_FIT);
  assertEquals(minFitFor({ min_fit: "70" }), DEFAULT_MIN_FIT);
});

Deno.test("only unreviewed machine-discovered prospects can be dropped", () => {
  const base = { status: "discovered", approved_at: null, source: "outbound", campaign_id: null, submission_id: null };
  assertEquals(isDroppable(base), true);
  assertEquals(isDroppable({ ...base, approved_at: "2026-10-13T13:15:10Z" }), false); // a person approved it
  assertEquals(isDroppable({ ...base, status: "pending" }), false);
  assertEquals(isDroppable({ ...base, status: "nurture" }), false);
  assertEquals(isDroppable({ ...base, status: "replied" }), false);
  assertEquals(isDroppable({ ...base, status: "unsubscribed" }), false); // suppression record must stay
  assertEquals(isDroppable({ ...base, source: "inbound" }), false);
  assertEquals(isDroppable({ ...base, campaign_id: "c1" }), false); // a client's own contact list
  assertEquals(isDroppable({ ...base, submission_id: "s1" }), false);
});

Deno.test("normalizeUrl matches the form discovery dedupes on", () => {
  assertEquals(normalizeUrl("http://www.Keka.com/"), "keka.com");
  assertEquals(normalizeUrl("https://keka.com"), "keka.com");
  assertEquals(normalizeUrl("keka.com/about/"), "keka.com/about");
});
