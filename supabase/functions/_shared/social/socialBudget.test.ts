import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { isBudgetCapped, trimToBudget, windowBudget } from "./socialBudget.ts";

const d = (s: string) => new Date(s);

Deno.test("only transformation is budget-capped", () => {
  assertEquals(isBudgetCapped("transformation"), true);
  assertEquals(isBudgetCapped(" Transformation "), true);
  assertEquals(isBudgetCapped("growth"), false);
  assertEquals(isBudgetCapped(null), false);
});

Deno.test("a 30-day transformation cycle gets 20 posts", () => {
  const cycle = { start: d("2026-10-14T09:44:19Z"), end: d("2026-11-13T09:44:19Z") };
  assertEquals(windowBudget("transformation", cycle), 20);
});

Deno.test("budget scales with cycle length and falls back to the rolling window", () => {
  assertEquals(windowBudget("transformation", { start: d("2026-10-01T00:00:00Z"), end: d("2026-10-16T00:00:00Z") }), 10);
  assertEquals(windowBudget("transformation", null), 19);
});

Deno.test("uncapped tiers have no budget", () => {
  assertEquals(windowBudget("growth", null), null);
  assertEquals(windowBudget("foundation", { start: d("2026-10-01T00:00:00Z"), end: d("2026-11-01T00:00:00Z") }), null);
});

Deno.test("trim keeps the earliest rows that fit after existing slots", () => {
  const rows = [
    { scheduled_for: "2026-11-05T09:00:00Z" },
    { scheduled_for: "2026-10-20T09:00:00Z" },
    { scheduled_for: "2026-10-27T09:00:00Z" },
  ];
  assertEquals(trimToBudget(rows, 12, 10).map((r) => r.scheduled_for), ["2026-10-20T09:00:00Z", "2026-10-27T09:00:00Z"]);
  assertEquals(trimToBudget(rows, 10, 10), []);
  assertEquals(trimToBudget(rows, 5, 10), []);
  assertEquals(trimToBudget(rows, null, 99).length, 3);
});
