import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { buildLearned, isCycleInvoice, periodFromInvoice, summarizeProspects, summarizeSocial, sweepWindow, planIssues
} from "./cycle.ts";

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

import { isRetryableSkip, isRunInProgress, remainingSteps, RUN_STALE_MS } from "./cycle.ts";

const ALL = ["learn", "social_strategy", "social_schedule", "prospect_discovery"];

Deno.test("remainingSteps: nothing recorded -> run everything (undefined)", () => {
  assertEquals(remainingSteps({}, ALL), undefined);
});

Deno.test("remainingSteps: a run that died after two steps resumes at the rest", () => {
  const prior = { learn: { status: "ok" as const }, social_strategy: { status: "ok" as const } };
  assertEquals([...remainingSteps(prior, ALL)!], ["social_schedule", "prospect_discovery"]);
});

Deno.test("remainingSteps: errored and retryable-skipped steps run again, permanent skips do not", () => {
  const prior = {
    learn: { status: "skipped" as const, detail: "nothing new" },
    social_strategy: { status: "error" as const, detail: "boom" },
    social_schedule: { status: "skipped" as const, retry_when_ready: true },
    prospect_discovery: { status: "ok" as const },
  };
  assertEquals([...remainingSteps(prior, ALL)!].sort(), ["social_schedule", "social_strategy"]);
});

Deno.test("remainingSteps: everything done -> empty set (finalize only)", () => {
  const prior = Object.fromEntries(ALL.map((n) => [n, { status: "ok" as const }]));
  assertEquals(remainingSteps(prior, ALL)!.size, 0);
});

Deno.test("isRetryableSkip: only skipped + flagged", () => {
  assertEquals(isRetryableSkip({ status: "skipped", retry_when_ready: true }), true);
  assertEquals(isRetryableSkip({ status: "skipped" }), false);
  assertEquals(isRetryableSkip({ status: "error", retry_when_ready: true }), false);
  assertEquals(isRetryableSkip(undefined), false);
});

Deno.test("isRunInProgress: recent attempt blocks, stale or absent does not", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  assertEquals(isRunInProgress({ last_attempt_at: new Date(now - 60_000).toISOString() }, now), true);
  assertEquals(isRunInProgress({ last_attempt_at: new Date(now - RUN_STALE_MS - 1).toISOString() }, now), false);
  assertEquals(isRunInProgress({}, now), false);
  assertEquals(isRunInProgress(null, now), false);
});

Deno.test("planIssues flags ok-but-empty steps and errors", () => {
  const issues = planIssues(
    { prospect_discovery: { status: "ok", detail: "0 new via x" }, social_schedule: { status: "ok", detail: "0 slots" }, learn: { status: "error", detail: "boom" } },
    { discovered: 0 },
  );
  assertEquals(issues.length, 3);
  assertEquals(planIssues({ prospect_discovery: { status: "ok" }, social_schedule: { status: "ok", detail: "3 slots" } }, { discovered: 5 }), []);
  assertEquals(planIssues({ prospect_discovery: { status: "skipped" } }, { discovered: 0 }), []);
});
