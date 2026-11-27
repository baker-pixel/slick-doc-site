import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type Bet, type CycleMetricsData, type Window,
  enoughFor, perDay, reviewLines, reviewMode, runCycleReview, sampleOk, validateReview,
} from "./cycleReview.ts";

const win = (days: number, o: Partial<{ posts: number; views: number; leads: number; opens: number; seo: number | null }> = {}): Window => ({
  window: { days },
  social: { published: o.posts ?? 0, by_platform: { linkedin: { views_total: o.views ?? 0 } } },
  outreach: { leads: o.leads ?? 0, opens: o.opens ?? 0, clicks: 0, replies: 0 },
  website: { visits: 0 },
  seo: { score_end: o.seo ?? null },
});
const data = (cur: Window, prev: Window | null): CycleMetricsData => ({
  cycle: { cycle_no: 2 }, current: cur, previous: prev ? { cycle_no: 1, metrics: prev } : null,
});
const bet = (id: string, metric: Bet["metric"] = "social_views"): Bet => ({ id, hypothesis: "h", change: `change ${id}`, scope: "social", metric, evidence: "e" });
const NOW = new Date("2026-11-27T00:00:00Z");

Deno.test("sampleOk: needs a previous cycle, long enough windows and enough events", () => {
  assertEquals(sampleOk(data(win(30, { views: 500 }), null), "social_views"), false);
  assertEquals(sampleOk(data(win(30, { views: 500 }), win(30, { views: 400 })), "social_views"), true);
  assertEquals(sampleOk(data(win(3, { views: 500 }), win(30, { views: 400 })), "social_views"), false); // short cycle
  assertEquals(sampleOk(data(win(30, { leads: 2 }), win(30, { leads: 1 })), "leads"), false); // 3 events
  assertEquals(sampleOk(data(win(3, { seo: 80 }), win(3, { seo: 70 })), "seo_score"), true); // a score, not events
  assertEquals(sampleOk(data(win(30, {}), win(30, { seo: 70 })), "seo_score"), false); // no current score
});

Deno.test("validateReview: a win or loss on a small sample is downgraded to inconclusive", () => {
  const small = data(win(30, { leads: 2 }), win(30, { leads: 1 }));
  const r = validateReview({ verdicts: [{ bet_id: "b1", verdict: "worked", evidence: "leads up" }] }, [bet("b1", "leads")], small, "shadow", NOW);
  assertEquals(r.verdicts[0].verdict, "inconclusive");
  const big = data(win(30, { leads: 20 }), win(30, { leads: 10 }));
  const r2 = validateReview({ verdicts: [{ bet_id: "b1", verdict: "worked", evidence: "leads up" }] }, [bet("b1", "leads")], big, "shadow", NOW);
  assertEquals(r2.verdicts[0].verdict, "worked");
});

Deno.test("validateReview: an unjudged prior bet is reported, an unknown bet id is dropped", () => {
  const d = data(win(30, { views: 500 }), win(30, { views: 400 }));
  const r = validateReview({ verdicts: [{ bet_id: "ghost", verdict: "failed", evidence: "x" }] }, [bet("b1")], d, "shadow", NOW);
  assertEquals(r.verdicts.map((v) => [v.bet_id, v.verdict]), [["b1", "inconclusive"]]);
});

Deno.test("validateReview: at most two bets, with a valid scope and metric", () => {
  const d = data(win(30), win(30));
  const mk = (scope: string, metric: string, change = "do a thing") => ({ hypothesis: "h", change, scope, metric, evidence: "e" });
  const r = validateReview({ bets: [mk("billing", "leads"), mk("social", "nonsense"), mk("social", "posts"), mk("social", "posts"), mk("prospect", "replies"), mk("social", "visits")] }, [], d, "shadow", NOW);
  assertEquals(r.bets.map((b) => [b.id, b.scope, b.metric]), [["c2-b1", "social", "posts"], ["c2-b2", "prospect", "replies"]]);
  assertEquals(validateReview({ bets: [mk("social", "posts", "")] }, [], d, "shadow", NOW).bets.length, 0);
  assertEquals(validateReview({ bets: [{ ...mk("social", "posts"), evidence: "" }] }, [], d, "shadow", NOW).bets.length, 0); // no evidence, no bet
  assertEquals(validateReview("garbage", [], d, "shadow", NOW).bets, []);
});

Deno.test("reviewLines: keeps what worked, stops what failed, names the new bets", () => {
  const r = {
    mode: "live" as const, reviewed_cycle_no: 2, reviewed_at: "", findings: [], learned: ["Short posts did better"],
    verdicts: [
      { bet_id: "b1", verdict: "worked" as const, evidence: "" },
      { bet_id: "b2", verdict: "failed" as const, evidence: "" },
      { bet_id: "b3", verdict: "inconclusive" as const, evidence: "" },
    ],
    bets: [{ id: "c2-b1", hypothesis: "h", change: "post on Tuesdays", scope: "social" as const, metric: "posts" as const, evidence: "e" }],
  };
  const plenty = data(win(30, { posts: 20, leads: 20 }), win(30, { posts: 20, leads: 20 }));
  assertEquals(reviewLines(r, [bet("b1"), bet("b2"), bet("b3")], plenty), [
    "Keep doing: change b1", "Stop: change b2", "Try this cycle (social): post on Tuesdays", "Short posts did better",
  ]);
  // Too little activity (3 posts, 2 leads): no new bet and no free-text lesson reaches the planners.
  // (Verdicts were already downgraded to inconclusive by validateReview when the sample was small.)
  const thin = data(win(8, { posts: 3, leads: 2 }), win(30, { posts: 16, leads: 30 }));
  assertEquals(reviewLines(r, [bet("b1"), bet("b2"), bet("b3")], thin), ["Keep doing: change b1", "Stop: change b2"]);
});

Deno.test("enoughFor: needs the window length and activity in that scope", () => {
  const d = data(win(30, { posts: 20, leads: 2 }), null);
  assertEquals(enoughFor(d, "social"), true);
  assertEquals(enoughFor(d, "prospect"), false);
  assertEquals(enoughFor(data(win(3, { posts: 20, leads: 20 }), null), "social"), false);
});

// A chainable stand-in for the supabase client: every query method returns itself, awaiting it yields the rows.
const table = (rows: unknown) => {
  const t: any = { then: (ok: any) => Promise.resolve({ data: rows, error: null }).then(ok), maybeSingle: () => Promise.resolve({ data: rows, error: null }) };
  for (const m of ["select", "eq", "in", "lt", "order", "limit"]) t[m] = () => t;
  return t;
};
const db = (o: { settings?: unknown[]; closed?: unknown; metrics?: unknown }) => ({
  from: (name: string) => table(name === "admin_settings" ? (o.settings ?? []) : name === "client_cycles" ? (o.closed ?? null) : []),
  rpc: () => Promise.resolve({ data: o.metrics ?? null, error: null }),
});

Deno.test("reviewMode: off unless switched on, and limited to the listed clients", async () => {
  assertEquals(await reviewMode(db({}), "c1"), "off");
  assertEquals(await reviewMode(db({ settings: [{ key: "cycle_review", value: "bogus" }] }), "c1"), "off");
  const on = [{ key: "cycle_review", value: "live" }];
  assertEquals(await reviewMode(db({ settings: on }), "c1"), "live");
  assertEquals(await reviewMode(db({ settings: [...on, { key: "cycle_review_clients", value: "c2, c3" }] }), "c1"), "off");
  assertEquals(await reviewMode(db({ settings: [...on, { key: "cycle_review_clients", value: "c2, c1" }] }), "c1"), "live");
});

Deno.test("runCycleReview: off means no model call; on judges the closed cycle's own bets", async () => {
  let calls = 0;
  const callModel = (_s: string, prompt: string) => {
    calls++;
    assertEquals(JSON.parse(prompt).previous_bets.length, 1);
    return Promise.resolve({ verdicts: [{ bet_id: "b1", verdict: "worked", evidence: "views up" }], bets: [{ hypothesis: "h", change: "try x", scope: "social", metric: "posts", evidence: "e" }], findings: ["f"], learned: ["l"] });
  };
  const closed = { id: "cy1", plan: { review: { bets: [bet("b1")] } } };
  const metrics = data(win(30, { views: 500, posts: 20, leads: 20 }), win(30, { views: 400, posts: 20, leads: 20 }));

  assertEquals(await runCycleReview(db({ closed, metrics }), "c1", { period_end: "2026-12-01" }, { callModel }), null);
  assertEquals(calls, 0);

  const settings = [{ key: "cycle_review", value: "live" }];
  const r = await runCycleReview(db({ settings, closed, metrics }), "c1", { period_end: "2026-12-01" }, { callModel, now: () => NOW });
  assertEquals(calls, 1);
  assertEquals(r?.verdicts[0].verdict, "worked");
  assertEquals(r?.lines, ["Keep doing: change b1", "Try this cycle (social): try x", "l"]);

  assertEquals(await runCycleReview(db({ settings, closed: null, metrics }), "c1", { period_end: "2026-12-01" }, { callModel }), null); // nothing closed yet
});

Deno.test("perDay: totals from unequal cycles become comparable rates", () => {
  const short = perDay(win(8, { posts: 4, opens: 4, seo: 75 }));
  const long = perDay(win(30, { posts: 15, opens: 12, seo: 83 }));
  assertEquals([short.posts, short.opens, short.seo_score], [0.5, 0.5, 75]);
  assertEquals([long.posts, long.opens, long.seo_score], [0.5, 0.4, 83]);
  assertEquals(perDay(win(8, {})).seo_score, null);
});

Deno.test("perDay: visits are per day that has website data, not per day of the window", () => {
  const w = win(8, {});
  w.website = { visits: 59, days_with_data: 2 };
  assertEquals(perDay(w).visits, 29.5);
  w.website = { visits: 0, days_with_data: 0 };
  assertEquals(perDay(w).visits, null);
});
