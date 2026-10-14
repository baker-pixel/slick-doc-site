import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { agentInfo, budgetStatus, buildSpendReport, parseBudget, reconcile, tokenCost, type RateRow, type RawUsage } from "./aiSpend.ts";

const rate = (over: Partial<RateRow>): RateRow => ({
  key: "m", kind: "tokens", provider: "OpenAI", label: "M", input_per_mtok: 1, output_per_mtok: 2, unit_cost: null, note: null, verified: false, ...over,
});

Deno.test("token cost is (input x rate + output x rate) per million", () => {
  // 1,000,000 in at $0.40 + 500,000 out at $1.60 = 0.40 + 0.80 = $1.20
  assertAlmostEquals(tokenCost(1_000_000, 500_000, rate({ input_per_mtok: 0.4, output_per_mtok: 1.6 }))!, 1.2, 1e-9);
  assertEquals(tokenCost(0, 0, rate({})), 0);
});

Deno.test("a missing or blank price is null, never $0", () => {
  assertEquals(tokenCost(1000, 1000, undefined), null);
  assertEquals(tokenCost(1000, 1000, rate({ input_per_mtok: null })), null);
  assertEquals(tokenCost(1000, 1000, rate({ kind: "unit" })), null);
});

Deno.test("budget status", () => {
  assertEquals(budgetStatus(10, 20, null), "no_budget");
  assertEquals(budgetStatus(10, 20, 100), "on_track");
  assertEquals(budgetStatus(10, 85, 100), "watch");
  assertEquals(budgetStatus(10, 120, 100), "will_exceed");
  assertEquals(budgetStatus(100, 100, 100), "over");
});

Deno.test("budget parsing ignores junk", () => {
  assertEquals(parseBudget("250"), 250);
  assertEquals(parseBudget(null), null);
  assertEquals(parseBudget(""), null);
  assertEquals(parseBudget("abc"), null);
  assertEquals(parseBudget("-5"), null);
  assertEquals(parseBudget("0"), null);
});

Deno.test("agents get plain-English names, unknown ones fall back sensibly", () => {
  assertEquals(agentInfo("analyze-website").label, "Reading websites");
  assertEquals(agentInfo("some-new-agent").label, "Some New Agent");
  assertEquals(agentInfo("some-new-agent").area, "other");
});

// "now" = 15 Oct 2026, so the month has 31 days and 15 are elapsed.
const NOW = new Date("2026-10-15T12:00:00Z");
const base = (): RawUsage => ({
  usage: [],
  images: [],
  units: [],
  rates: [
    rate({ key: "gpt-4.1-mini", label: "GPT-4.1 mini", input_per_mtok: 0.4, output_per_mtok: 1.6 }),
    rate({ key: "gpt-4o-mini", label: "GPT-4o mini", input_per_mtok: 0.15, output_per_mtok: 0.6 }),
    rate({ key: "image_gpt_image_2", kind: "unit", label: "Images", unit_cost: null, input_per_mtok: null, output_per_mtok: null }),
  ],
  budget: null,
  clients: [{ id: "c1", name: "Acme", tier: "growth", status: "active" }, { id: "c2", name: "Beta", tier: "foundation", status: "active" }],
});
const row = (day: string, model: string, source: string, client: string | null, calls: number, p: number, c: number, failed = 0) =>
  ({ day, model, source, client_id: client, calls, failed, prompt_tokens: p, completion_tokens: c });

Deno.test("month-to-date spend, per task, per client", () => {
  const raw = base();
  raw.usage = [
    row("2026-10-10", "gpt-4.1-mini", "analyze-website", "c1", 10, 2_000_000, 100_000), // 0.8 + 0.16 = 0.96
    row("2026-10-11", "gpt-4o-mini", "content-qa", "c2", 5, 1_000_000, 500_000),       // 0.15 + 0.30 = 0.45
    row("2026-09-20", "gpt-4.1-mini", "analyze-website", "c1", 1, 1_000_000, 0),        // last month: 0.40, not counted this month
  ];
  const r = buildSpendReport(raw, NOW);
  assertAlmostEquals(r.month.spent, 1.41, 0.005);
  assertAlmostEquals(r.last_month.spent, 0.4, 0.005);
  assertEquals(r.agents[0].source, "analyze-website");
  assertAlmostEquals(r.agents[0].pct, 68.1, 0.1); // 0.96 / 1.41
  assertEquals(r.clients[0].name, "Acme");
  assertAlmostEquals(r.clients[0].cost, 0.96, 0.005);
  assertEquals(r.month.calls, 15);
  assertEquals(r.areas[0].area, "prospecting");
});

Deno.test("forecast uses the last 7 complete days and the budget gives a status", () => {
  const raw = base();
  raw.budget = "100";
  // $7.00 a day for each of the 7 complete days before "now" (8-14 Oct): 17.5M prompt tokens at $0.40/M = $7.
  for (let d = 8; d <= 14; d++) raw.usage.push(row(`2026-10-${String(d).padStart(2, "0")}`, "gpt-4.1-mini", "analyze-website", "c1", 10, 17_500_000, 0));
  const r = buildSpendReport(raw, NOW);
  assertAlmostEquals(r.month.spent, 49, 0.01);            // 7 days x $7
  assertAlmostEquals(r.month.daily_avg_7d, 7, 0.01);
  assertAlmostEquals(r.month.forecast, 49 + 7 * (31 - 15), 0.01); // 49 + 112 = 161
  assertEquals(r.month.status, "will_exceed");            // 161 > 100
  assertAlmostEquals(r.month.pct_of_budget!, 49, 0.1);
});

Deno.test("unpriced models and units are reported, never silently counted as zero", () => {
  const raw = base();
  raw.usage = [
    row("2026-10-12", "mystery-model", "seo-audit", "c1", 4, 1_000_000, 1_000_000),
    row("2026-10-12", "gpt-4.1-mini", "seo-audit", "c1", 1, 1_000_000, 0, 0),
    row("2026-10-12", "gpt-4.1-mini", "seo-audit", "c1", 3, 0, 0, 3), // failed calls: no tokens
  ];
  raw.images = [{ day: "2026-10-12", n: 41 }];
  const r = buildSpendReport(raw, NOW);
  assertAlmostEquals(r.month.spent, 0.4, 0.005); // only the priced model counts
  const text = r.not_included.map((n) => n.what).join(" | ");
  assertEquals(text.includes("mystery-model"), true);
  assertEquals(text.includes("Images"), true);
  assertEquals(text.includes("Failed AI calls"), true);
  assertEquals(r.month.failed_calls, 3);
});

Deno.test("once a unit price is set, images are counted", () => {
  const raw = base();
  raw.rates = raw.rates.map((x) => (x.key === "image_gpt_image_2" ? { ...x, unit_cost: 0.05 } : x));
  raw.images = [{ day: "2026-10-12", n: 40 }];
  const r = buildSpendReport(raw, NOW);
  assertAlmostEquals(r.month.spent, 2, 0.001); // 40 x $0.05
  assertEquals(r.units.find((u) => u.key === "image_gpt_image_2")!.cost, 2);
  assertEquals(r.not_included.length, 0);
});

Deno.test("spend is compared with the same days last month, not the whole month", () => {
  const raw = base();
  raw.usage = [
    row("2026-10-05", "gpt-4.1-mini", "x", null, 1, 10_000_000, 0), // $4.00 this month
    row("2026-09-05", "gpt-4.1-mini", "x", null, 1, 5_000_000, 0),  // $2.00 within the first 15 days of last month
    row("2026-09-28", "gpt-4.1-mini", "x", null, 1, 50_000_000, 0), // $20 later in last month: excluded from the comparison
  ];
  const r = buildSpendReport(raw, NOW);
  assertAlmostEquals(r.last_month.same_period, 2, 0.001);
  assertAlmostEquals(r.last_month.spent, 22, 0.001);
  assertEquals(r.insights.some((i) => i.includes("up 100%")), true);
  assertEquals(r.clients[0].name, "Platform (not tied to a client)");
});

Deno.test("daily series is 30 zero-filled days ending today", () => {
  const r = buildSpendReport(base(), NOW);
  assertEquals(r.daily.length, 30);
  assertEquals(r.daily[29].day, "2026-10-15");
  assertEquals(r.daily.every((d) => d.cost === 0), true);
});

Deno.test("providers roll up this month's text and per-item cost, ready to check against an invoice", () => {
  const raw = base();
  raw.rates = raw.rates.map((x) => (x.key === "image_gpt_image_2" ? { ...x, unit_cost: 0.15 } : x));
  raw.usage = [row("2026-10-10", "gpt-4.1-mini", "analyze-website", "c1", 1, 2_000_000, 0)]; // 0.80
  raw.images = [{ day: "2026-10-10", n: 10 }];                                                   // 1.50
  const r = buildSpendReport(raw, NOW);
  const openai = r.providers.find((p) => p.provider === "OpenAI")!;
  assertAlmostEquals(openai.text_cost, 0.8, 0.001);
  assertAlmostEquals(openai.unit_cost, 1.5, 0.001);
});

Deno.test("reconcile reports the gap and implies a per-image price when images are the unpriced part", () => {
  const raw = base();
  raw.usage = [row("2026-10-10", "gpt-4.1-mini", "x", "c1", 1, 2_000_000, 0)]; // text = 0.80
  raw.images = [{ day: "2026-10-10", n: 20 }];                                    // images unpriced
  const r = buildSpendReport(raw, NOW);
  const out = reconcile(r, "OpenAI", 4.8); // their bill: 4.80 -> images = 4.00 over 20 = 0.20 each
  assertAlmostEquals(out.our_total, 0.8, 0.001);
  assertAlmostEquals(out.gap, 4.0, 0.001);
  assertEquals(out.suggestion?.unit_cost, 0.2);
  assertEquals(out.suggestion?.count, 20);
  // an unknown provider reconciles against zero and gives no suggestion
  assertEquals(reconcile(r, "Nobody", 5).suggestion, null);
});

Deno.test("once images are priced the biggest-cost line can be images, not a text task", () => {
  const raw = base();
  raw.rates = raw.rates.map((x) => (x.key === "image_gpt_image_2" ? { ...x, unit_cost: 0.15 } : x));
  raw.usage = [row("2026-10-10", "gpt-4.1-mini", "analyze-website", "c1", 1, 2_000_000, 0)]; // 0.80
  raw.images = [{ day: "2026-10-10", n: 39 }];                                                  // 5.85
  const r = buildSpendReport(raw, NOW);
  assertEquals(r.insights.some((i) => i.startsWith("Images is your biggest cost: $5.85, 88%")), true);
});
