import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { buildSearchPlans, mergeKeywords, rotatePlans, widenGeography } from "./discoveryRotation.ts";

Deno.test("plans: one per keyword, then all together", () => {
  assertEquals(buildSearchPlans(["a", "b"]), [["a"], ["b"], ["a", "b"]]);
  assertEquals(buildSearchPlans(["a"]), [["a"]]);
  assertEquals(buildSearchPlans([]), []);
  assertEquals(buildSearchPlans(["a", " a ", "b"]), [["a"], ["b"], ["a", "b"]]);
});

Deno.test("rotation starts somewhere new each run and covers every plan", () => {
  const plans = ["p0", "p1", "p2"];
  assertEquals(rotatePlans(plans, 0), ["p0", "p1", "p2"]);
  assertEquals(rotatePlans(plans, 1), ["p1", "p2", "p0"]);
  assertEquals(rotatePlans(plans, 5), ["p2", "p0", "p1"]);
  assertEquals(rotatePlans([], 3), []);
});

Deno.test("geography widens one step and stops at country level", () => {
  assertEquals(widenGeography("Knoxville, TN metro"), "TN");
  assertEquals(widenGeography("Austin, Texas"), "Texas");
  assertEquals(widenGeography("United States (focus on urban markets)"), null);
  assertEquals(widenGeography("Global"), null);
  assertEquals(widenGeography("Texas"), null);
});

Deno.test("merge keeps existing order, drops repeats, caps the list", () => {
  assertEquals(mergeKeywords(["a", "b"], ["B", "c", "c", " "]), ["a", "b", "c"]);
  assertEquals(mergeKeywords(["a"], ["b", "c", "d"], 3), ["a", "b", "c"]);
});
