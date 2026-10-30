import { assert, assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { type ClientContext, contextToPrompt, summarizeOutcomes } from "./clientContext.ts";
import { tierPolicy } from "./tierPolicy.ts";

const base = (): ClientContext => ({
  client: { id: "c1", business_name: "Acme Roofing", industry: "roofing", tier: "growth", status: "active", website_url: "https://acme.test" },
  policy: tierPolicy("growth"),
  profile: { summary: "Family roofer in Knoxville" },
  goals: [{ id: "g1", engine: "seo", objective: "Raise SEO score", metric: "seo_score", baseline_value: 62, target_value: 80, due_date: "2026-12-31", project_id: null, status: "active" }],
  projects: [], outcomes: [], activity: [], lessons: [], decisions: [],
  feedback: { rejected: [], approved: [] },
  open: { pendingProposals: 0, requests: [] },
  gaps: [],
});

Deno.test("summarizeOutcomes: latest and previous per source+metric, newest first input", () => {
  const out = summarizeOutcomes([
    { source: "seo", metric: "seo_score", value: 84, captured_at: "2026-10-20" },
    { source: "seo", metric: "seo_score", value: "70", captured_at: "2026-10-01" },
    { source: "seo", metric: "seo_score", value: 50, captured_at: "2026-09-01" },
    { source: "prospect", metric: "converted", value: 2, captured_at: "2026-10-10" },
  ]);
  assertEquals(out.length, 2);
  assertEquals(out[0], { source: "seo", metric: "seo_score", latest: 84, previous: 70, as_of: "2026-10-20" });
  assertEquals(out[1].previous, null);
});

Deno.test("contextToPrompt: includes goals with ids and targets", () => {
  const text = contextToPrompt(base());
  assert(text.includes("## ACTIVE GOALS"));
  assert(text.includes("[g1] (seo) Raise SEO score | seo_score: 62 -> 80 by 2026-12-31"));
});

Deno.test("contextToPrompt: over budget drops low-priority sections whole and names them", () => {
  const ctx = base();
  ctx.lessons = [{ id: "m1", engine: null, kind: "lesson", content: "Never use emoji", rationale: null, outcome: null, created_at: "2026-10-01" }];
  ctx.activity = Array.from({ length: 15 }, (_, i) => ({ type: "seo_audit", title: `Audit number ${i} with a fairly long title`, at: "2026-10-01T00:00:00Z" }));
  const text = contextToPrompt(ctx, 330);
  assert(text.includes("## CLIENT"));
  assert(text.includes("## ACTIVE GOALS"));
  assert(!text.includes("## RECENT ACTIVITY"));
  assert(text.includes("omitted for length: RECENT ACTIVITY"));
});

Deno.test("contextToPrompt: always keeps the client section, even when it alone exceeds the budget", () => {
  assert(contextToPrompt(base(), 10).includes("Acme Roofing"));
});

Deno.test("contextToPrompt: says when the view is partial", () => {
  const ctx = base();
  ctx.gaps = ["goals: boom"];
  assert(contextToPrompt(ctx).includes("partial view, could not load: goals: boom"));
});
