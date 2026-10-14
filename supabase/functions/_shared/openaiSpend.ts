// AI spend, with OpenAI as the source of truth.
//
// Dollars come straight from OpenAI's Costs API and requests/tokens from its
// Usage API (both need an organization Admin key). Nothing here prices tokens or
// images itself: there is no rate card. What OpenAI cannot tell us is which of
// OUR tasks or clients caused a charge, so attribution is shown as usage only
// (requests and tokens from our own logs), never as invented dollars.
//
// Endpoints (confirmed against OpenAI's usage/cost cookbook):
//   GET https://api.openai.com/v1/organization/costs
//       start_time (unix s, required), bucket_width=1d (only value), limit (<=180), group_by=line_item|project_id, page
//       -> { data: [{ start_time, end_time, results: [{ amount: { value, currency }, line_item, project_id }] }], next_page }
//   GET https://api.openai.com/v1/organization/usage/completions
//       start_time, bucket_width, limit, group_by=model, page
//       -> { data: [{ start_time, end_time, results: [{ input_tokens, output_tokens, num_model_requests, model }] }], next_page }

export const OPENAI_API = "https://api.openai.com/v1/organization";
const MAX_PAGES = 20;

export type OpenAIErrorKind = "not_connected" | "unauthorized" | "forbidden" | "not_found" | "rate_limited" | "server" | "network" | "bad_response";

export class OpenAIApiError extends Error {
  kind: OpenAIErrorKind;
  status: number | null;
  constructor(kind: OpenAIErrorKind, message: string, status: number | null = null) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

export type KeyKind = "admin" | "standard";

/** Plain-English explanation and fix for each failure, shown to the owner. */
export function explainError(e: OpenAIApiError, keyKind: KeyKind = "admin"): { title: string; fix: string } {
  // We try the platform's everyday OpenAI key when no Admin key is set. OpenAI only lets
  // an Admin key read billing, so a refusal there means "create an Admin key", not "broken".
  if (keyKind === "standard" && (e.kind === "unauthorized" || e.kind === "forbidden" || e.kind === "not_found")) {
    return {
      title: "OpenAI won't let our everyday key read billing",
      fix: "We tried the OpenAI key the platform already uses to write content, and OpenAI only allows a separate Admin key to read spend. Create one (steps below) and this page will show your real numbers.",
    };
  }
  switch (e.kind) {
    case "not_connected":
      return { title: "OpenAI isn't connected yet", fix: "Add an OpenAI Admin key (steps below) and this page will show your real spend." };
    case "unauthorized":
      return { title: "OpenAI rejected the key", fix: "The Admin key is wrong, expired or revoked. Create a new one in OpenAI (Settings → Admin keys) and save it again." };
    case "forbidden":
      return { title: "The key doesn't have permission to read usage", fix: "Use an Admin key created by an organization Owner, with permission to read usage and costs." };
    case "not_found":
      return { title: "OpenAI didn't recognise the request", fix: "The costs endpoint may not be available to this organization. Check that your OpenAI organization has usage data and that the key is an Admin key." };
    case "rate_limited":
      return { title: "OpenAI asked us to slow down", fix: "Try again in a minute. The last good numbers are shown if we have them." };
    default:
      return { title: "Couldn't reach OpenAI right now", fix: "Try again shortly. The last good numbers are shown if we have them." };
  }
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

/** Follows OpenAI's cursor pagination (`next_page`) and returns every bucket. */
export async function fetchBuckets(
  endpoint: "costs" | "usage/completions",
  adminKey: string,
  params: Record<string, string | string[]>,
  fetchFn: FetchFn = fetch,
): Promise<any[]> {
  const out: any[] = [];
  let page: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) for (const one of Array.isArray(v) ? v : [v]) qs.append(k, one);
    if (page) qs.set("page", page);

    let res: Response;
    try {
      res = await fetchFn(`${OPENAI_API}/${endpoint}?${qs}`, { headers: { Authorization: `Bearer ${adminKey}`, "Content-Type": "application/json" } });
    } catch (e) {
      throw new OpenAIApiError("network", e instanceof Error ? e.message : "network error");
    }
    if (!res.ok) {
      const kind: OpenAIErrorKind = res.status === 401 ? "unauthorized" : res.status === 403 ? "forbidden" : res.status === 404 ? "not_found" : res.status === 429 ? "rate_limited" : "server";
      let detail = "";
      try { detail = (await res.json())?.error?.message ?? ""; } catch { /* no body */ }
      throw new OpenAIApiError(kind, detail || `OpenAI returned HTTP ${res.status}`, res.status);
    }
    let body: any;
    try { body = await res.json(); } catch { throw new OpenAIApiError("bad_response", "OpenAI returned something that isn't JSON"); }
    if (!Array.isArray(body?.data)) throw new OpenAIApiError("bad_response", "OpenAI's reply had no data list");
    out.push(...body.data);
    page = typeof body.next_page === "string" && body.next_page ? body.next_page : null;
    if (!page) break;
  }
  return out;
}

export interface CostRow { day: string; line_item: string; usd: number }
export interface UsageRow { day: string; model: string; requests: number; input_tokens: number; output_tokens: number }

const dayOf = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().slice(0, 10);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

/** Only USD is summed: mixing currencies would silently corrupt the total. */
export function parseCostBuckets(buckets: any[]): { rows: CostRow[]; otherCurrencies: string[] } {
  const rows: CostRow[] = [];
  const other = new Set<string>();
  for (const b of buckets) {
    const day = dayOf(n(b?.start_time));
    for (const r of b?.results ?? []) {
      const currency = String(r?.amount?.currency ?? "usd").toLowerCase();
      if (currency !== "usd") { other.add(currency); continue; }
      rows.push({ day, line_item: typeof r?.line_item === "string" && r.line_item ? r.line_item : "Other", usd: n(r?.amount?.value) });
    }
  }
  return { rows, otherCurrencies: [...other] };
}

export function parseUsageBuckets(buckets: any[]): UsageRow[] {
  const rows: UsageRow[] = [];
  for (const b of buckets) {
    const day = dayOf(n(b?.start_time));
    for (const r of b?.results ?? []) {
      rows.push({ day, model: typeof r?.model === "string" && r.model ? r.model : "unknown", requests: n(r?.num_model_requests), input_tokens: n(r?.input_tokens), output_tokens: n(r?.output_tokens) });
    }
  }
  return rows;
}

/** "gpt-4.1-mini-2025-04-14, input" -> "gpt-4.1-mini, input". OpenAI's own wording is kept; only the date stamp is dropped. */
export function cleanLineItem(s: string): string {
  return s.replace(/-\d{4}-\d{2}-\d{2}(?=\b)/g, "").trim() || "Other";
}
export const isImageLineItem = (s: string) => /image/i.test(s);

// ---------- our own usage, for attribution only (no dollars) ----------

export interface AttributionRow { day: string; model: string; source: string; client_id: string | null; calls: number; failed: number; prompt_tokens: number; completion_tokens: number }
export interface Attribution { usage: AttributionRow[]; budget: string | null; clients: Array<{ id: string; name: string; tier: string | null; status: string }> }

export const isOpenAIModel = (m: string) => /^(gpt-|o\d|chatgpt|text-embedding|dall-e|omni)/i.test(m);

export type Area = "social" | "prospecting" | "seo" | "clients" | "other";
export const AGENT_INFO: Record<string, { label: string; area: Area; what: string }> = {
  "analyze-website": { label: "Reading websites", area: "prospecting", what: "Reads each prospect's website to understand what they do." },
  "run-prospect-drip": { label: "Writing outreach emails", area: "prospecting", what: "Writes each prospect's 4-email sequence." },
  "score-prospect-fit": { label: "Scoring prospect fit", area: "prospecting", what: "Decides how well each prospect matches the client's ideal customer." },
  "prospect-icp": { label: "Defining ideal customers", area: "prospecting", what: "Works out who each client should be selling to." },
  "ensure-client-icp": { label: "Defining ideal customers", area: "prospecting", what: "Works out who each client should be selling to." },
  "icp-search-keywords": { label: "Choosing search keywords", area: "prospecting", what: "Picks the company types to search for." },
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
const titleCase = (s: string) => s.replace(/[-_:]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
export const agentInfo = (source: string) => AGENT_INFO[source] ?? { label: titleCase(source), area: "other" as Area, what: "" };

// ---------- budget ----------

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
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : null;
}

// ---------- the report ----------

const round2 = (x: number) => Math.round(x * 100) / 100;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, k: number) => { const x = new Date(d.getTime()); x.setUTCDate(x.getUTCDate() + k); return x; };
const daysInMonth = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

export interface SpendInput {
  costs: CostRow[];
  usage: UsageRow[];
  attribution: Attribution;
  now: Date;
}

export function buildReport({ costs, usage, attribution, now }: SpendInput) {
  const thisMonth = ymd(now).slice(0, 7);
  const lastMonth = ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))).slice(0, 7);
  const dom = now.getUTCDate();
  const dim = daysInMonth(now.getUTCFullYear(), now.getUTCMonth());

  // ---- OpenAI's dollars ----
  const dailyUsd = new Map<string, number>();
  const lineItems = new Map<string, number>();
  let monthSpend = 0, lastTotal = 0, lastSamePeriod = 0;
  for (const c of costs) {
    dailyUsd.set(c.day, (dailyUsd.get(c.day) ?? 0) + c.usd);
    const m = c.day.slice(0, 7);
    if (m === thisMonth) {
      monthSpend += c.usd;
      const k = cleanLineItem(c.line_item);
      lineItems.set(k, (lineItems.get(k) ?? 0) + c.usd);
    } else if (m === lastMonth) {
      lastTotal += c.usd;
      if (Number(c.day.slice(8, 10)) <= dom) lastSamePeriod += c.usd;
    }
  }

  // Projection only (not a price): average of the last 7 COMPLETE days x days left. Today is partial.
  const yesterday = addDays(now, -1);
  let sum7 = 0;
  for (let i = 0; i < 7; i++) sum7 += dailyUsd.get(ymd(addDays(yesterday, -i))) ?? 0;
  const avg7 = sum7 / 7;
  const forecast = monthSpend + avg7 * (dim - dom);
  const budget = parseBudget(attribution.budget);
  const status = budgetStatus(monthSpend, forecast, budget);

  const lines = [...lineItems.entries()].map(([line_item, usd]) => ({ line_item, usd: round2(usd), pct: pct(usd, monthSpend), image: isImageLineItem(line_item) }))
    .sort((a, b) => b.usd - a.usd);
  const imageUsd = lines.filter((l) => l.image).reduce((t, l) => t + l.usd, 0);

  const daily = [];
  for (let i = 29; i >= 0; i--) {
    const d = ymd(addDays(now, -i));
    daily.push({ day: d, usd: round2(dailyUsd.get(d) ?? 0) });
  }

  // ---- OpenAI's own request/token counts (this month) ----
  let uReq = 0, uTok = 0;
  for (const u of usage) if (u.day.slice(0, 7) === thisMonth) { uReq += u.requests; uTok += u.input_tokens + u.output_tokens; }

  // ---- attribution: OUR usage, no dollars ----
  const clientName = new Map(attribution.clients.map((c) => [c.id, c]));
  const byTask = new Map<string, { calls: number; failed: number; tokens: number }>();
  const byClient = new Map<string, { calls: number; tokens: number }>();
  let groqCalls = 0, ourCalls = 0, ourTokens = 0;
  for (const r of attribution.usage) {
    if (r.day.slice(0, 7) !== thisMonth) continue;
    if (!isOpenAIModel(r.model)) { groqCalls += n(r.calls); continue; } // not billed through OpenAI
    const tokens = n(r.prompt_tokens) + n(r.completion_tokens);
    ourCalls += n(r.calls); ourTokens += tokens;
    const t = byTask.get(r.source) ?? { calls: 0, failed: 0, tokens: 0 };
    t.calls += n(r.calls); t.failed += n(r.failed); t.tokens += tokens; byTask.set(r.source, t);
    const ck = r.client_id ?? "none";
    const c = byClient.get(ck) ?? { calls: 0, tokens: 0 };
    c.calls += n(r.calls); c.tokens += tokens; byClient.set(ck, c);
  }
  const tasks = [...byTask.entries()].map(([source, v]) => {
    const info = agentInfo(source);
    return { source, label: info.label, what: info.what, area: info.area, calls: v.calls, failed: v.failed, tokens: v.tokens, share: pct(v.tokens, ourTokens) };
  }).sort((a, b) => b.tokens - a.tokens);
  const clients = [...byClient.entries()].map(([id, v]) => {
    const c = clientName.get(id);
    return { id: id === "none" ? null : id, name: c?.name ?? (id === "none" ? "Platform (not tied to a client)" : "Unknown client"), tier: c?.tier ?? null, calls: v.calls, tokens: v.tokens, share: pct(v.tokens, ourTokens) };
  }).sort((a, b) => b.tokens - a.tokens);

  // ---- plain-English takeaways ----
  const money = (x: number) => `$${x >= 100 ? Math.round(x).toLocaleString("en-US") : x.toFixed(2)}`;
  const insights: string[] = [];
  if (budget !== null) {
    insights.push(status === "over"
      ? `You have already spent ${money(monthSpend)}, over your ${money(budget)} monthly budget.`
      : `At this pace OpenAI will bill about ${money(forecast)} this month: ${Math.round((forecast / budget) * 100)}% of your ${money(budget)} budget.`);
  } else {
    insights.push(`At this pace OpenAI will bill about ${money(forecast)} this month. Set a monthly budget above to track it.`);
  }
  if (lines[0] && monthSpend > 0) {
    insights.push(`${lines[0].line_item} is the biggest charge: ${money(lines[0].usd)}, ${lines[0].pct}% of this month.${lines[0].pct >= 50 ? " Savings would come from here first." : ""}`);
  }
  if (imageUsd > 0 && monthSpend > 0 && !lines[0]?.image) insights.push(`Image generation is ${pct(imageUsd, monthSpend)}% of the bill (${money(imageUsd)}).`);
  if (lastSamePeriod > 0) {
    const change = Math.round(((monthSpend - lastSamePeriod) / lastSamePeriod) * 100);
    insights.push(`Compared with the same days last month, spending is ${change >= 0 ? "up" : "down"} ${Math.abs(change)}%.`);
  }

  return {
    month: {
      label: now.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
      spent: round2(monthSpend), budget, pct_of_budget: budget ? Math.round((monthSpend / budget) * 1000) / 10 : null,
      forecast: round2(forecast), status, day_of_month: dom, days_in_month: dim, daily_avg_7d: round2(avg7),
      openai_requests: uReq, openai_tokens: uTok,
    },
    last_month: { spent: round2(lastTotal), same_period: round2(lastSamePeriod) },
    daily, lines, insights,
    attribution: { tasks, clients, our_requests: ourCalls, our_tokens: ourTokens, groq_requests: groqCalls },
  };
}
export type SpendReport = ReturnType<typeof buildReport>;
