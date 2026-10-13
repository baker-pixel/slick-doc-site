import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { buildLearned, isCycleInvoice, periodFromInvoice, summarizeProspects, summarizeSocial, sweepWindow } from "./cycle.ts";

Deno.test("isCycleInvoice: only paid create/cycle invoices", () => {
  assertEquals(isCycleInvoice({ status: "paid", billing_reason: "subscription_cycle" }), true);
  assertEquals(isCycleInvoice({ status: "paid", billing_reason: "subscription_create" }), true);
  assertEquals(isCycleInvoice({ status: "paid", billing_reason: "subscription_update" }), false);
  assertEquals(isCycleInvoice({ status: "open", billing_reason: "subscription_cycle" }), false);
  assertEquals(isCycleInvoice({ status: "paid", billing_reason: "manual" }), false);
});

Deno.test("periodFromInvoice: picks the longest-span line, ignores zero-length", () => {
  const inv = {
    lines: { data: [
      { period: { start: 1000, end: 1000 } },
      { period: { start: 1000, end: 1000 + 30 * 86400 } },
      { period: { start: 1000, end: 1000 + 86400 } },
    ] },
  };
  const p = periodFromInvoice(inv)!;
  assertEquals(p.start.getTime(), 1000 * 1000);
  assertEquals(p.end.getTime(), (1000 + 30 * 86400) * 1000);
  assertEquals(periodFromInvoice({ lines: { data: [] } }), null);
  assertEquals(periodFromInvoice({}), null);
});

Deno.test("sweepWindow: continues from previous end, else one month back", () => {
  const end = "2026-11-12T00:00:00Z";
  assertEquals(sweepWindow(end, "2026-10-12T00:00:00Z").start.toISOString(), "2026-10-12T00:00:00.000Z");
  assertEquals(sweepWindow(end, null).start.toISOString(), "2026-10-13T00:00:00.000Z");
  // A previous end after the new end is nonsense; fall back to a month back.
  assertEquals(sweepWindow(end, "2026-12-01T00:00:00Z").start.toISOString(), "2026-10-13T00:00:00.000Z");
});

Deno.test("summarizeSocial: counts, rate, reasons and per-platform", () => {
  const d = summarizeSocial([
    { status: "approved", platform: "linkedin" },
    { status: "approved", platform: "linkedin" },
    { status: "rejected", platform: "facebook", feedback: " too salesy " },
    { status: "changes_requested", platform: "facebook", feedback: "shorter" },
    { status: "pending", platform: "facebook" },
  ], 3, ["a"]);
  assertEquals(d.reviewed, 4);
  assertEquals(d.approval_rate, 50);
  assertEquals(d.rejection_reasons, ["too salesy", "shorter"]);
  assertEquals(d.by_platform.facebook, { approved: 0, rejected: 1 });
  assertEquals(d.published, 3);
});

Deno.test("summarizeSocial: no reviews -> null rate", () => {
  assertEquals(summarizeSocial([], 0, []).approval_rate, null);
});

Deno.test("summarizeProspects + buildLearned: deterministic takeaways", () => {
  const p = summarizeProspects([
    { status: "discovered" },
    { status: "nurture", opened_at: "x" },
    { status: "replied", replied_at: "x", business_type: "Dentist" },
    { status: "converted", converted_at: "x", replied_at: "x", business_type: "Dentist" },
  ]);
  assertEquals(p.discovered, 4);
  assertEquals(p.contacted, 3);
  assertEquals(p.replied, 2);
  assertEquals(p.converted, 1);
  assertEquals(p.replied_types, ["Dentist"]);
  const s = summarizeSocial([{ status: "rejected", platform: "facebook", feedback: "off brand" }], 0, []);
  const learned = buildLearned(s, p);
  assertEquals(learned.some((l) => l.includes("off brand")), true);
  assertEquals(learned.some((l) => l.includes("facebook")), true);
  assertEquals(learned.some((l) => l.includes("2 replied")), true);
});

Deno.test("buildLearned: nothing happened -> no claims", () => {
  assertEquals(buildLearned(summarizeSocial([], 0, []), summarizeProspects([])), []);
});
