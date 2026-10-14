// AI spend & budget. Turns raw usage (tokens per model/task/client/day) plus an
// editable rate card into the numbers an owner plans a budget with. Pure
// functions only (no I/O) so the arithmetic is unit-tested.
//
// Principles:
//  - Never count a missing price as $0. Anything unpriced is listed as "not
//    included" so the total is understood to be a floor, not a guess.
//  - Failed calls carry no token counts, so their cost is unknown; they are
//    counted and reported, not priced.
//  - Rates are estimates until the owner marks them verified.

export interface RateRow {
  key: string; kind: "tokens" | "unit"; provider: string; label: string;
  input_per_mtok: number | null; output_per_mtok: number | null; unit_cost: number | null;
  note: string | null; verified: boolean;
}
export interface UsageRow {
  day: string; model: string; source: string; client_id: string | null;
  calls: number; failed: number; prompt_tokens: number; completion_tokens: number;
}
export interface RawUsage {
  usage: UsageRow[];
  images: Array<{ day: string; n: number }>;
  units: Array<{ day: string; unit: string; n: number }>;
  rates: RateRow[];
  budget: string | null;
  clients: Array<{ id: string; name: string; tier: string | null; status: string }>;
}

export type Area = "social" | "prospecting" | "seo" | "clients" | "other";
export const AREA_LABEL: Record<Area, string> = {
  social: "Social media", prospecting: "Prospecting & outreach", seo: "SEO & website", clients: "Client setup & learning", other: "Other",
};

/** Plain-English name, business area and one-line purpose for each AI task (agent_runs.source). */
export const AGENT_INFO: Record<string, { label: string; area: Area; what: string }> = {
  "analyze-website": { label: "Reading websites", area: "prospecting", what: "Reads each prospect's website to understand what they do. Runs for every prospect found." },
  "run-prospect-drip": { label: "Writing outreach emails", area: "prospecting", what: "Writes each prospect's 4-email sequence." },
  "score-prospect-fit": { label: "Scoring prospect fit", area: "prospecting", what: "Decides how well each prospect matches the client's ideal customer." },
  "prospect-icp": { label: "Defining ideal customers", area: "prospecting", what: "Works out who each client should be selling to." },
  "icp-search-keywords": { label: "Choosing search keywords", area: "prospecting", what: "Picks the company types to search for." },
  "ensure-client-icp": { label: "Defining ideal customers", area: "prospecting", what: "Works out who each client should be selling to." },
  "discovery-focus": { label: "Choosing who to search for", area: "prospecting", what: "Picks a fresh angle for each prospect search." },
  "generate-lead-insights": { label: "Lead insights", area: "prospecting", what: "Summarises a lead for the team." },
  "fill-scheduled-content": { label: "Writing social captions", area: "social", what: "Writes the caption for each scheduled post." },
  "content-claims-check": { label: "Fact-checking posts", area: "social", what: "Checks posts don't claim things we can't back up." },
  "content-qa": { label: "Quality-checking posts", area: "social", what: "Scores each post for tone and quality." },
  "creative-image-concept": { label: "Planning post images", area: "social", what: "Writes the brief for each post's image." },
  "extract-post-topic": { label: "Tracking post topics", area: "social", what: "Records what each post is about so topics don't repeat." },
  "generate-social-strategy": { label: "Social strategy", area: "social", what: "Sets each client's content themes for the cycle." },
  "handle-approval-regenerate": { label: "Rewriting rejected posts", area: "social", what: "Rewrites posts a client asked to change." },
  "generate-approval-draft": { label: "Drafting approvals", area: "social", what: "Drafts content for client approval." },
  "seo-audit": { label: "SEO audits", area: "seo", what: "Scores a client's website and lists fixes." },
  "scan-wordpress-site": { label: "WordPress scans", area: "seo", what: "Reads a client's WordPress site." },
  "generate-fix-plan": { label: "SEO fix plans", area: "seo", what: "Turns audit findings into a fix plan." },
  "refine-client-context": { label: "Learning each client's business", area: "clients", what: "Updates what we know about each client from their results." },
  "extract-brand-assets": { label: "Reading brand assets", area: "clients", what: "Pulls colours, voice and rules from a client's brand." },
  "generate-brand-guidelines": { label: "Brand guidelines", area: "clients", what: "Writes a client's brand guide." },
  "generate-analysis": { label: "Business analysis", area: "clients", what: "Analyses a lead's marketing gaps." },
  "run-automation:ai_task": { label: "Admin AI tasks", area: "other", what: "One-off AI tasks run from the admin." },
};

export function titleCase(s: string): string {
  return s.replace(/[-_:]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
export function agentInfo(source: string) {
  return AGENT_INFO[source] ?? { label: titleCase(source), area: "other" as Area, what: "" };
}

const UNIT_AREA: Record<string, Area> = { image_gpt_image_2: "social", apollo_email_lookup: "prospecting", maps_call: "prospecting" };
const UNIT_FOR_IMAGES = "image_gpt_image_2";

/** Cost of one group of calls, or null when the model has no usable price. */
export function tokenCost(promptTokens: number, completionTokens: number, rate: RateRow | undefined): number | null {
  if (!rate || rate.kind !== "tokens" || rate.input_per_mtok === null || rate.output_per_mtok === null) return null;
  return (promptTokens * rate.input_per_mtok + completionTokens * rate.output_per_mtok) / 1_000_000;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const round2 = (n: number) => Math.round(n * 100) / 100;
const monthOf = (day: string) => day.slice(0, 7);
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}
function ymd(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number): Date { const x = new Date(d.getTime()); x.setUTCDate(x.getUTCDate() + n); return x; }

export type BudgetStatus = "no_budget" | "on_track" | "watch" | "will_exceed" | "over";

export function budgetStatus(spent: number, forecast: number, budget: number | null): BudgetStatus {
  if (budget === null || budget <= 0) return "no_budget";
  if (spent >= budget) return "over";
  if (forecast > budget) return "will_exceed";
  if (forecast > budget * 0.8) return "watch";
  return "on_track";
}

export function parseBudget(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function buildSpendReport(raw: RawUsage, now: Date) {
  const rates = new Map(raw.rates.map((r) => [r.key, r]));
  const clientName = new Map(raw.clients.map((c) => [c.id, c]));
  const thisMonth = ymd(now).slice(0, 7);
  const prevDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastMonth = ymd(prevDate).slice(0, 7);
  const dom = now.getUTCDate();
  const dim = daysInMonth(now.getUTCFullYear(), now.getUTCMonth());

  // ---- token spend, priced row by row ----
  const dailyCost = new Map<string, number>();
  const dailyCalls = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

  let monthSpend = 0, lastMonthSpend = 0, lastMonthToDate = 0;
  let monthCalls = 0, monthFailed = 0, monthTokens = 0;
  const byAgent = new Map<string, { calls: number; failed: number; tokens: number; cost: number }>();
  const byModel = new Map<string, { calls: number; failed: number; prompt: number; completion: number; cost: number; priced: boolean }>();
  const byClient = new Map<string, { calls: number; cost: number }>();
  const unpricedModels = new Map<string, { calls: number; tokens: number }>();
  const providerText = new Map<string, number>();

  for (const r of raw.usage) {
    const m = monthOf(r.day);
    const calls = num(r.calls), failed = num(r.failed), p = num(r.prompt_tokens), c = num(r.completion_tokens);
    const cost = tokenCost(p, c, rates.get(r.model));
    add(dailyCalls, r.day, calls);
    if (cost !== null) add(dailyCost, r.day, cost);

    if (m === lastMonth) {
      if (cost !== null) { lastMonthSpend += cost; if (Number(r.day.slice(8, 10)) <= dom) lastMonthToDate += cost; }
    }
    if (m !== thisMonth) continue;

    monthCalls += calls; monthFailed += failed; monthTokens += p + c;
    if (cost !== null) {
      monthSpend += cost;
      const prov = rates.get(r.model)?.provider ?? "Unknown";
      providerText.set(prov, (providerText.get(prov) ?? 0) + cost);
    }

    const a = byAgent.get(r.source) ?? { calls: 0, failed: 0, tokens: 0, cost: 0 };
    a.calls += calls; a.failed += failed; a.tokens += p + c; a.cost += cost ?? 0;
    byAgent.set(r.source, a);

    const mo = byModel.get(r.model) ?? { calls: 0, failed: 0, prompt: 0, completion: 0, cost: 0, priced: cost !== null };
    mo.calls += calls; mo.failed += failed; mo.prompt += p; mo.completion += c; mo.cost += cost ?? 0;
    byModel.set(r.model, mo);

    const ck = r.client_id ?? "none";
    const cl = byClient.get(ck) ?? { calls: 0, cost: 0 };
    cl.calls += calls; cl.cost += cost ?? 0;
    byClient.set(ck, cl);

    if (cost === null && p + c > 0) {
      const u = unpricedModels.get(r.model) ?? { calls: 0, tokens: 0 };
      u.calls += calls; u.tokens += p + c;
      unpricedModels.set(r.model, u);
    }
  }

  // ---- images and other paid lookups (per-unit prices) ----
  const unitTotals = new Map<string, { month: number; last: number }>();
  const unitAdd = (key: string, day: string, n: number) => {
    const t = unitTotals.get(key) ?? { month: 0, last: 0 };
    if (monthOf(day) === thisMonth) t.month += n; else if (monthOf(day) === lastMonth) t.last += n;
    unitTotals.set(key, t);
    const rate = rates.get(key)?.unit_cost;
    if (rate !== null && rate !== undefined) {
      const cost = n * rate;
      add(dailyCost, day, cost);
      if (monthOf(day) === thisMonth) monthSpend += cost;
      else if (monthOf(day) === lastMonth) { lastMonthSpend += cost; if (Number(day.slice(8, 10)) <= dom) lastMonthToDate += cost; }
    }
  };
  for (const i of raw.images) unitAdd(UNIT_FOR_IMAGES, i.day, num(i.n));
  for (const u of raw.units) unitAdd(u.unit, u.day, num(u.n));

  const unitLines = [...rates.values()].filter((r) => r.kind === "unit").map((r) => {
    const t = unitTotals.get(r.key) ?? { month: 0, last: 0 };
    return {
      key: r.key, label: r.label, provider: r.provider, note: r.note, area: UNIT_AREA[r.key] ?? "other",
      this_month: t.month, last_month: t.last, unit_cost: r.unit_cost,
      cost: r.unit_cost === null ? null : round2(t.month * r.unit_cost), verified: r.verified,
    };
  });

  // What each provider should be billing us this month, so it can be checked against their invoice.
  const providers = [...new Set([...providerText.keys(), ...unitLines.map((u) => u.provider)])].map((provider) => {
    const lines = unitLines.filter((u) => u.provider === provider);
    return {
      provider,
      text_cost: round2(providerText.get(provider) ?? 0),
      unit_cost: round2(lines.reduce((t, u) => t + (u.cost ?? 0), 0)),
      units: lines.map((u) => ({ key: u.key, label: u.label, count: u.this_month, unit_cost: u.unit_cost })),
    };
  });

  // ---- forecast ----
  // Average of the last 7 COMPLETE days (today is partial, so it would drag the average down).
  const yesterday = addDays(now, -1);
  let sum7 = 0;
  for (let i = 0; i < 7; i++) sum7 += dailyCost.get(ymd(addDays(yesterday, -i))) ?? 0;
  const avg7 = sum7 / 7;
  const forecast = monthSpend + avg7 * (dim - dom);
  const budget = parseBudget(raw.budget);
  const status = budgetStatus(monthSpend, forecast, budget);

  // ---- breakdowns ----
  const total = monthSpend || 0;
  const areaAgg = new Map<Area, { cost: number; calls: number }>();
  const addArea = (area: Area, cost: number, calls: number) => {
    const a = areaAgg.get(area) ?? { cost: 0, calls: 0 };
    a.cost += cost; a.calls += calls; areaAgg.set(area, a);
  };

  const agents = [...byAgent.entries()].map(([source, v]) => {
    const info = agentInfo(source);
    addArea(info.area, v.cost, v.calls);
    return { source, label: info.label, what: info.what, area: info.area, calls: v.calls, failed: v.failed, tokens: v.tokens, cost: round2(v.cost), pct: pct(v.cost, total) };
  }).sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);

  for (const u of unitLines) if (u.cost !== null) addArea(u.area as Area, u.cost, 0);

  const areas = [...areaAgg.entries()].map(([area, v]) => ({ area, label: AREA_LABEL[area], cost: round2(v.cost), calls: v.calls, pct: pct(v.cost, total) }))
    .sort((a, b) => b.cost - a.cost);

  const models = [...byModel.entries()].map(([model, v]) => {
    const r = rates.get(model);
    return {
      model, label: r?.label ?? model, provider: r?.provider ?? "Unknown", calls: v.calls, failed: v.failed,
      prompt_tokens: v.prompt, completion_tokens: v.completion, cost: round2(v.cost), priced: v.priced,
      input_per_mtok: r?.input_per_mtok ?? null, output_per_mtok: r?.output_per_mtok ?? null, verified: r?.verified ?? false,
    };
  }).sort((a, b) => b.cost - a.cost || b.calls - a.calls);

  const clients = [...byClient.entries()].map(([id, v]) => {
    const c = clientName.get(id);
    return { id: id === "none" ? null : id, name: c?.name ?? (id === "none" ? "Platform (not tied to a client)" : "Unknown client"), tier: c?.tier ?? null, status: c?.status ?? null, calls: v.calls, cost: round2(v.cost), pct: pct(v.cost, total) };
  }).sort((a, b) => b.cost - a.cost);

  // ---- daily series for the last 30 days ----
  const daily = [];
  for (let i = 29; i >= 0; i--) {
    const d = ymd(addDays(now, -i));
    daily.push({ day: d, cost: round2(dailyCost.get(d) ?? 0), calls: dailyCalls.get(d) ?? 0 });
  }

  // ---- not included ----
  const notIncluded: Array<{ what: string; amount: string }> = [];
  for (const [model, v] of unpricedModels) notIncluded.push({ what: `${rates.get(model)?.label ?? model} (no price set)`, amount: `${v.calls.toLocaleString("en-US")} calls, ${v.tokens.toLocaleString("en-US")} tokens` });
  for (const u of unitLines) if (u.unit_cost === null && u.this_month > 0) notIncluded.push({ what: `${u.label} (no price set)`, amount: `${u.this_month.toLocaleString("en-US")} this month` });
  if (monthFailed > 0) notIncluded.push({ what: "Failed AI calls (token counts weren't recorded)", amount: `${monthFailed.toLocaleString("en-US")} calls` });

  // ---- plain-English insights ----
  const insights: string[] = [];
  const money = (n: number) => `$${n >= 100 ? Math.round(n).toLocaleString("en-US") : n.toFixed(2)}`;
  if (budget !== null) {
    if (status === "over") insights.push(`You have already spent ${money(monthSpend)}, which is over your ${money(budget)} monthly budget.`);
    else insights.push(`At this pace you'll spend about ${money(forecast)} this month: ${Math.round((forecast / budget) * 100)}% of your ${money(budget)} budget.`);
  } else {
    insights.push(`At this pace you'll spend about ${money(forecast)} this month. Set a monthly budget above to track it.`);
  }
  const costItems = [
    ...agents.map((a) => ({ label: a.label, cost: a.cost })),
    ...unitLines.filter((u) => u.cost !== null).map((u) => ({ label: u.label, cost: u.cost as number })),
  ].sort((a, b) => b.cost - a.cost);
  if (costItems[0] && costItems[0].cost > 0 && total > 0) {
    const share = pct(costItems[0].cost, total);
    insights.push(`${costItems[0].label} is your biggest cost: ${money(costItems[0].cost)}, ${share}% of this month.${share >= 50 ? " Savings would come from here first." : ""}`);
  }
  if (clients[0] && clients[0].cost > 0 && clients.filter((c) => c.cost > 0).length > 1) {
    insights.push(`${clients[0].name} costs the most: ${money(clients[0].cost)} (${clients[0].pct}% of AI spend).`);
  }
  if (lastMonthToDate > 0) {
    const change = Math.round(((monthSpend - lastMonthToDate) / lastMonthToDate) * 100);
    insights.push(`Compared with the same days last month, spending is ${change >= 0 ? "up" : "down"} ${Math.abs(change)}%.`);
  }
  if (monthFailed > 0 && monthCalls > 0) {
    insights.push(`${monthFailed.toLocaleString("en-US")} AI calls failed this month (${pct(monthFailed, monthCalls)}%). They aren't priced here and usually cost little, but a rising number points to a provider problem.`);
  }
  if (notIncluded.some((n) => n.what.includes("no price"))) {
    insights.push("Some usage has no price yet, so the totals are a minimum. Add the prices in the rate card for a complete number.");
  }

  return {
    month: {
      label: now.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
      spent: round2(monthSpend), budget, pct_of_budget: budget ? Math.round((monthSpend / budget) * 1000) / 10 : null,
      forecast: round2(forecast), status, day_of_month: dom, days_in_month: dim, daily_avg_7d: round2(avg7),
      calls: monthCalls, failed_calls: monthFailed, tokens: monthTokens,
    },
    last_month: { spent: round2(lastMonthSpend), same_period: round2(lastMonthToDate) },
    daily, areas, agents, models, clients, units: unitLines, providers, not_included: notIncluded, insights,
    rates: raw.rates,
  };
}

export type Report = ReturnType<typeof buildSpendReport>;

/**
 * Compare our estimate for one provider with the number on their own usage page
 * or invoice. If the provider's per-item line is the only thing we can't price
 * (e.g. OpenAI images) the gap implies a per-item price; suggest it.
 */
export function reconcile(report: Report, provider: string, theirTotal: number) {
  const p = report.providers.find((x) => x.provider.toLowerCase() === provider.toLowerCase());
  const ours = p ? round2(p.text_cost + p.unit_cost) : 0;
  const gap = round2(theirTotal - ours);
  let suggestion: { key: string; label: string; unit_cost: number; count: number } | null = null;
  if (p && p.units.length === 1 && p.units[0].count > 0) {
    const implied = (theirTotal - p.text_cost) / p.units[0].count;
    if (implied >= 0 && Number.isFinite(implied)) suggestion = { key: p.units[0].key, label: p.units[0].label, unit_cost: Math.round(implied * 1000) / 1000, count: p.units[0].count };
  }
  return {
    provider, their_total: round2(theirTotal), our_text: p?.text_cost ?? 0, our_units: p?.unit_cost ?? 0,
    our_total: ours, gap, gap_pct: theirTotal > 0 ? Math.round((gap / theirTotal) * 1000) / 10 : 0, suggestion,
  };
}
