import { assert, assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { isInSendWindow, nextWindowOpen, snapToSendWindow } from "./sendWindow.ts";

// 2026-11-04 is a Wednesday.
const at = (iso: string) => new Date(iso);

Deno.test("window is weekdays 14:00-20:00 UTC", () => {
  assertEquals(isInSendWindow(at("2026-11-04T14:00:00Z")), true);
  assertEquals(isInSendWindow(at("2026-11-04T19:59:59Z")), true);
  assertEquals(isInSendWindow(at("2026-11-04T20:00:00Z")), false);
  assertEquals(isInSendWindow(at("2026-11-04T13:59:59Z")), false);
  assertEquals(isInSendWindow(at("2026-11-07T15:00:00Z")), false); // Saturday
  assertEquals(isInSendWindow(at("2026-11-08T15:00:00Z")), false); // Sunday
});

Deno.test("next opening: later today, tomorrow, or Monday", () => {
  assertEquals(nextWindowOpen(at("2026-11-04T09:00:00Z")).toISOString(), "2026-11-04T14:00:00.000Z"); // before open
  assertEquals(nextWindowOpen(at("2026-11-04T22:00:00Z")).toISOString(), "2026-11-05T14:00:00.000Z"); // after close
  assertEquals(nextWindowOpen(at("2026-11-06T22:00:00Z")).toISOString(), "2026-11-09T14:00:00.000Z"); // Fri night -> Mon
  assertEquals(nextWindowOpen(at("2026-11-07T10:00:00Z")).toISOString(), "2026-11-09T14:00:00.000Z"); // Saturday
  assertEquals(nextWindowOpen(at("2026-11-08T10:00:00Z")).toISOString(), "2026-11-09T14:00:00.000Z"); // Sunday
});

Deno.test("a time inside the window is not moved", () => {
  const d = at("2026-11-04T15:30:00Z");
  assertEquals(snapToSendWindow(d, "p1:1").toISOString(), d.toISOString());
});

Deno.test("a time outside the window lands in the first two hours of the next one", () => {
  const out = snapToSendWindow(at("2026-11-04T03:00:00Z"), "p1:1");
  assert(out.getTime() >= at("2026-11-04T14:00:00Z").getTime());
  assert(out.getTime() < at("2026-11-04T16:00:00Z").getTime());
  assertEquals(isInSendWindow(out), true);
});

Deno.test("the spread is stable per seed and differs between leads", () => {
  const d = at("2026-11-04T03:00:00Z");
  assertEquals(snapToSendWindow(d, "p1:1").getTime(), snapToSendWindow(d, "p1:1").getTime());
  const times = new Set(Array.from({ length: 20 }, (_, i) => snapToSendWindow(d, `lead${i}:1`).getTime()));
  assert(times.size > 5);
});
