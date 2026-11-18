import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { billingPeriodStart, dueForRegen } from "./billingPeriod.ts";

Deno.test("dueForRegen: true when never run", () => {
  assertEquals(dueForRegen(null, 30), true);
});

Deno.test("dueForRegen: false just under the cadence", () => {
  const now = new Date("2026-02-14T00:00:00Z");
  const last = new Date("2026-01-16T00:00:00Z"); // 29 days back
  assertEquals(dueForRegen(last, 30, now), false);
});

Deno.test("dueForRegen: true once cadence elapsed", () => {
  const now = new Date("2026-02-15T00:00:00Z");
  const last = new Date("2026-01-16T00:00:00Z"); // 30 days back
  assertEquals(dueForRegen(last, 30, now), true);
});

Deno.test("billingPeriodStart: mid-first-period stays at signup date", () => {
  const anchor = new Date("2026-01-15T00:00:00Z");
  const now = new Date("2026-01-20T00:00:00Z");
  assertEquals(billingPeriodStart(anchor, now).toISOString(), anchor.toISOString());
});

Deno.test("billingPeriodStart: rolls forward per elapsed 30-day period, not calendar month", () => {
  const anchor = new Date("2026-01-15T00:00:00Z");
  const now = new Date("2026-02-16T00:00:00Z"); // 32 days later
  assertEquals(billingPeriodStart(anchor, now).toISOString(), new Date("2026-02-14T00:00:00Z").toISOString());
});
