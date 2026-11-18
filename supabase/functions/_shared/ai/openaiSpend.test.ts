import { assertAlmostEquals, assertEquals, assertRejects } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  budgetStatus, buildReport, cleanLineItem, explainError, fetchBuckets, fetchProjects, filterByProjects, isOpenAIModel, OpenAIApiError, parseBudget, parseCostBuckets, parseUsageBuckets, PROJECT_ID,
  type Attribution,
} from "./openaiSpend.ts";

// Shapes below follow OpenAI's documented Costs / Usage responses.
const unix = (iso: string) => Math.floor(new Date(iso + "T00:00:00Z").getTime() / 1000);
const costBucket = (day: string, results: Array<[string, number, string?, (string | null)?]>) => ({
  object: "bucket", start_time: unix(day), end_time: unix(day) + 86400,
  results: results.map(([line_item, value, currency, project]) => ({ object: "organization.costs.result", amount: { value, currency: currency ?? "usd" }, line_item, project_id: project === undefined ? "proj_1" : project })),
});
const usageBucket = (day: string, results: Array<[string, number, number, number]>) => ({
  object: "bucket", start_time: unix(day), end_time: unix(day) + 86400,
  results: results.map(([model, req, i, o]) => ({ object: "organization.usage.completions.result", model, num_model_requests: req, input_tokens: i, output_tokens: o })),
});

Deno.test("cost buckets become USD rows; other currencies are reported, never added in", () => {
  const { rows, otherCurrencies } = parseCostBuckets([
    costBucket("2026-10-12", [["gpt-4.1-mini-2025-04-14, input", 0.5], ["image generation", 1.25]]),
    costBucket("2026-10-13", [["gpt-4.1-mini-2025-04-14, input", 0.75, "eur"]]),
    { start_time: unix("2026-10-14"), end_time: unix("2026-10-15"), results: [] }, // empty day
  ]);
  assertEquals(rows.length, 2);
  assertEquals(rows[0], { day: "2026-10-12", line_item: "gpt-4.1-mini-2025-04-14, input", project_id: "proj_1", usd: 0.5 });
  assertEquals(otherCurrencies, ["eur"]);
});

Deno.test("usage buckets keep OpenAI's own request and token counts", () => {
  const rows = parseUsageBuckets([usageBucket("2026-10-12", [["gpt-4.1-mini", 470, 141201, 9756]])]);
  assertEquals(rows, [{ day: "2026-10-12", model: "gpt-4.1-mini", project_id: null, requests: 470, input_tokens: 141201, output_tokens: 9756 }]);
});

Deno.test("line items keep OpenAI's wording, minus the date stamp", () => {
  assertEquals(cleanLineItem("gpt-4.1-mini-2025-04-14, input"), "gpt-4.1-mini, input");
  assertEquals(cleanLineItem("image generation"), "image generation");
  assertEquals(cleanLineItem(""), "Other");
});

// ---- pagination and errors, against a mock OpenAI ----

const mockFetch = (pages: Array<{ status?: number; body: unknown }>, seen: string[] = []) => {
  let i = 0;
  return (url: string, _init: RequestInit) => {
    seen.push(url);
    const p = pages[Math.min(i++, pages.length - 1)];
    return Promise.resolve(new Response(JSON.stringify(p.body), { status: p.status ?? 200 }));
  };
};

Deno.test("fetchBuckets follows next_page and sends the admin key, daily buckets and repeated group_by", async () => {
  const seen: string[] = [];
  const headers: string[] = [];
  const server = mockFetch([
    { body: { data: [costBucket("2026-10-01", [["a", 1]])], next_page: "cursor_2" } },
    { body: { data: [costBucket("2026-10-02", [["a", 2]])], next_page: null } },
  ], seen);
  const f = (url: string, init: RequestInit) => { headers.push(String((init.headers as Record<string, string>).Authorization)); return server(url, init); };
  const buckets = await fetchBuckets("costs", "sk-admin-test", { start_time: "1", bucket_width: "1d", limit: "180", group_by: ["line_item"] }, f);
  assertEquals(buckets.length, 2);
  assertEquals(seen.length, 2);
  assertEquals(seen[0].startsWith("https://api.openai.com/v1/organization/costs?"), true);
  assertEquals(seen[0].includes("bucket_width=1d") && seen[0].includes("group_by=line_item"), true);
  assertEquals(seen[1].includes("page=cursor_2"), true);
  assertEquals(headers[0], "Bearer sk-admin-test");
});

Deno.test("HTTP failures become typed errors with a plain-English fix", async () => {
  const kinds: Array<[number, string]> = [[401, "unauthorized"], [403, "forbidden"], [404, "not_found"], [429, "rate_limited"], [500, "server"]];
  for (const [status, kind] of kinds) {
    const err = await assertRejects(() => fetchBuckets("costs", "k", { start_time: "1" }, mockFetch([{ status, body: { error: { message: "nope" } } }])), OpenAIApiError);
    assertEquals(err.kind, kind);
    assertEquals(err.status, status);
    assertEquals(explainError(err).fix.length > 10, true);
  }
});

Deno.test("a reply that isn't OpenAI's shape is a clear error, not silent zeros", async () => {
  const err = await assertRejects(() => fetchBuckets("costs", "k", { start_time: "1" }, mockFetch([{ body: { unexpected: true } }])), OpenAIApiError);
  assertEquals(err.kind, "bad_response");
});

Deno.test("a network failure is reported as such", async () => {
  const err = await assertRejects(() => fetchBuckets("costs", "k", { start_time: "1" }, () => Promise.reject(new Error("dns"))), OpenAIApiError);
  assertEquals(err.kind, "network");
});

// ---- the report ----

const NOW = new Date("2026-10-15T12:00:00Z"); // 31-day month, 15 days elapsed
const attribution = (over: Partial<Attribution> = {}): Attribution => ({
  usage: [], budget: null, clients: [{ id: "c1", name: "Acme", tier: "growth", status: "active" }, { id: "c2", name: "Beta", tier: "foundation", status: "active" }], ...over,
});
const costs = (...b: Array<[string, Array<[string, number]>]>) => parseCostBuckets(b.map(([d, r]) => costBucket(d, r))).rows;

Deno.test("the month total is exactly what OpenAI billed, by day and by line item", () => {
  const r = buildReport({
    costs: costs(["2026-10-10", [["gpt-4.1-mini-2025-04-14, input", 0.4], ["image generation", 3.1]]], ["2026-10-11", [["image generation", 2.2]]], ["2026-09-12", [["image generation", 1]]]),
    usage: [], attribution: attribution(), now: NOW,
  });
  assertAlmostEquals(r.month.spent, 5.7, 1e-9); // 0.4 + 3.1 + 2.2, straight from OpenAI
  assertAlmostEquals(r.last_month.spent, 1, 1e-9);
  assertEquals(r.lines[0].line_item, "image generation");
  assertAlmostEquals(r.lines[0].usd, 5.3, 1e-9);
  assertEquals(r.lines[0].image, true);
  assertEquals(r.insights.some((i) => i.startsWith("image generation is the biggest charge: $5.30, 93")), true);
});

Deno.test("forecast uses OpenAI's last 7 complete days and status follows the budget", () => {
  const days = [8, 9, 10, 11, 12, 13, 14].map((d) => [`2026-10-${String(d).padStart(2, "0")}`, [["image generation", 7]]] as [string, Array<[string, number]>]);
  const r = buildReport({ costs: costs(...days), usage: [], attribution: attribution({ budget: "100" }), now: NOW });
  assertAlmostEquals(r.month.spent, 49, 1e-9);
  assertAlmostEquals(r.month.forecast, 49 + 7 * 16, 1e-9); // 161
  assertEquals(r.month.status, "will_exceed");
});

Deno.test("attribution is usage only: no dollar amounts, Groq kept separate", () => {
  const row = (model: string, source: string, client: string | null, calls: number, p: number, c: number, failed = 0) => ({ day: "2026-10-10", model, source, client_id: client, calls, failed, prompt_tokens: p, completion_tokens: c });
  const r = buildReport({
    costs: [], usage: [], now: NOW,
    attribution: attribution({ usage: [
      row("gpt-4.1-mini", "analyze-website", "c1", 10, 900, 100),
      row("gpt-4o-mini", "content-qa", "c2", 5, 90, 10),
      row("openai/gpt-oss-120b", "analyze-website", "c1", 7, 5000, 5000), // Groq, not billed by OpenAI
    ] }),
  });
  assertEquals(r.attribution.tasks[0].source, "analyze-website");
  assertEquals(r.attribution.tasks[0].share, 90.9); // 1000 of 1100 OpenAI tokens
  assertEquals(r.attribution.clients[0].name, "Acme");
  assertEquals(r.attribution.groq_requests, 7);
  assertEquals(r.attribution.our_requests, 15);
  assertEquals(JSON.stringify(r.attribution).includes("usd"), false);
});

Deno.test("OpenAI's own request and token counts are passed through", () => {
  const usage = parseUsageBuckets([usageBucket("2026-10-12", [["gpt-4.1-mini", 470, 141201, 9756]]), usageBucket("2026-09-12", [["gpt-4.1-mini", 9, 9, 9]])]);
  const r = buildReport({ costs: [], usage, attribution: attribution(), now: NOW });
  assertEquals(r.month.openai_requests, 470);
  assertEquals(r.month.openai_tokens, 150957);
});

Deno.test("budget helpers and model classification", () => {
  assertEquals(budgetStatus(10, 20, null), "no_budget");
  assertEquals(budgetStatus(100, 100, 100), "over");
  assertEquals(budgetStatus(10, 85, 100), "watch");
  assertEquals(parseBudget("250"), 250);
  assertEquals(parseBudget("abc"), null);
  assertEquals(isOpenAIModel("gpt-4.1-mini"), true);
  assertEquals(isOpenAIModel("openai/gpt-oss-120b"), false);
  assertEquals(isOpenAIModel("llama-3.3-70b-versatile"), false);
});

Deno.test("a server that never stops paginating is cut off, not looped forever", async () => {
  const seen: string[] = [];
  const stuck = mockFetch([{ body: { data: [], next_page: "again" } }], seen);
  await fetchBuckets("costs", "k", { start_time: "1" }, stuck);
  assertEquals(seen.length, 20);
});

Deno.test("a refusal of the everyday key is explained as 'create an Admin key', not as a broken connection", () => {
  const refused = explainError(new OpenAIApiError("forbidden", "Missing scopes: api.usage.read", 403), "standard");
  assertEquals(refused.title, "OpenAI won't let our everyday key read billing");
  assertEquals(refused.fix.includes("Admin key"), true);
  // The same refusal of a real Admin key is a different problem (wrong permissions), explained differently.
  assertEquals(explainError(new OpenAIApiError("forbidden", "nope", 403), "admin").title, "The key doesn't have permission to read usage");
  // Outages are the same either way.
  assertEquals(explainError(new OpenAIApiError("server", "boom", 500), "standard").title, "Couldn't reach OpenAI right now");
});

Deno.test("only the chosen OpenAI projects are counted; unlabelled rows are not assumed to be ours", () => {
  const rows = parseCostBuckets([costBucket("2026-10-12", [
    ["image generation", 5, "usd", "proj_orangedoor"],
    ["image generation", 40, "usd", "proj_someone_else"],
    ["gpt-4.1-mini, input", 1, "usd", null],
  ])]).rows;
  assertEquals(filterByProjects(rows, ["proj_orangedoor"]).map((r) => r.usd), [5]);
  assertEquals(filterByProjects(rows, []).length, 3); // no filter: everything, as before
  assertEquals(filterByProjects(rows, ["proj_orangedoor", "proj_someone_else"]).map((r) => r.usd), [5, 40]);
  // The month total follows the filter, so the headline number is OrangeDoor's only.
  const r = buildReport({ costs: filterByProjects(rows, ["proj_orangedoor"]), usage: [], attribution: attribution(), now: new Date("2026-10-15T12:00:00Z") });
  assertAlmostEquals(r.month.spent, 5, 1e-9);
});

Deno.test("project ids are validated before they are stored or sent to OpenAI", () => {
  assertEquals(PROJECT_ID.test("proj_abc123XYZ"), true);
  assertEquals(PROJECT_ID.test("proj_"), false);
  assertEquals(PROJECT_ID.test("org-123"), false);
  assertEquals(PROJECT_ID.test("proj_x&group_by=y"), false);
});

Deno.test("the project list is read across pages", async () => {
  const seen: string[] = [];
  const server = mockFetch([
    { body: { data: [{ id: "proj_1111", name: "OrangeDoor", status: "active" }], has_more: true, last_id: "proj_1111" } },
    { body: { data: [{ id: "proj_2222", name: "Side project", status: "archived" }, { object: "junk" }], has_more: false } },
  ], seen);
  const projects = await fetchProjects("sk-admin", server);
  assertEquals(projects, [{ id: "proj_1111", name: "OrangeDoor", status: "active" }, { id: "proj_2222", name: "Side project", status: "archived" }]);
  assertEquals(seen[1].includes("after=proj_1111"), true);
  assertEquals(seen[0].startsWith("https://api.openai.com/v1/organization/projects?"), true);
});

Deno.test("the project filter is sent to OpenAI as repeated project_ids with project grouping", async () => {
  const seen: string[] = [];
  await fetchBuckets("costs", "k", { start_time: "1", group_by: ["line_item", "project_id"], project_ids: ["proj_a", "proj_b"] }, mockFetch([{ body: { data: [] } }], seen));
  assertEquals(seen[0].includes("project_ids=proj_a&project_ids=proj_b"), true);
  assertEquals(seen[0].includes("group_by=line_item&group_by=project_id"), true);
});
