import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { recommendTier, tierLabel } from "./systemTier.ts";

Deno.test("score bands map to the plans we actually sell", () => {
  assertEquals(recommendTier(0), "transformation");
  assertEquals(recommendTier(39), "transformation");
  assertEquals(recommendTier(40), "growth");
  assertEquals(recommendTier(64), "growth");
  assertEquals(recommendTier(65), "foundation");
  assertEquals(recommendTier(100), "foundation");
});

Deno.test("labels use plan names; 'optimization' is not a plan", () => {
  assertEquals(tierLabel("foundation"), "Foundation");
  assertEquals(tierLabel("growth"), "Growth");
  assertEquals(tierLabel("transformation"), "Transformation");
  for (const s of [0, 20, 39, 40, 64, 65, 99]) assertEquals(tierLabel(recommendTier(s)) !== "Optimization", true);
});
