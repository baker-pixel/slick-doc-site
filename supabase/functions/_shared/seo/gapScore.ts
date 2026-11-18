// The ONE implementation of the self-reported SYSTEM score (Gap Analysis form).
//
// Used by the generate-analysis edge function AND the browser (src/lib/systemScorecard.ts
// re-exports it), so the on-screen report, the admin view, the emailed PDF and the stored
// row can never disagree. Pure TypeScript, no Deno/DOM APIs, so it runs in both.
//
// Principles
//  - Points reward what the answer SAYS, not that something was typed. "5 min." earns
//    the top response-time band, "next week" earns nothing.
//  - The form's scored questions are free text ("2023", "Weekly, Monthly", "Not sure"),
//    so every free-text answer goes through a parser first. Unparseable = no points
//    and counted as unanswered; it is never guessed.
//  - Items that don't apply to this business (landing pages when you run no ads) are
//    left out of that category's maximum instead of dragging the score down.
//  - Each category reports how many of its questions were answered, so a low score from
//    skipped questions can be told apart from a low score from real gaps.
//
// Bump GAP_SCORE_VERSION whenever a weight or band changes; scores are only comparable
// within one version.

export const GAP_SCORE_VERSION = "gap-score.v2";

export type ScoreStatus = "critical" | "weak" | "moderate" | "strong";
export type CategoryKey = "S" | "Y" | "S2" | "T" | "E" | "M";

export interface SystemScore {
  category: CategoryKey;
  label: string;
  score: number;
  status: ScoreStatus;
  color: string;
  /** Questions in this category the visitor gave a usable answer to. */
  answered: number;
  /** Questions in this category that apply to this business. */
  total: number;
}

export interface SystemScorecard {
  scores: SystemScore[];
  overallScore: number;
  overallStatus: string;
  /** Share of applicable questions answered, 0-100. Under ~50 means treat the score as provisional. */
  coverage: number;
  version: string;
}

// ---------------------------------------------------------------- parsing

const NONANSWER = /^(n\/?a|none|no|nope|nothing|not sure|unsure|unknown|idk|i don'?t know|dont know|-+|\?+)$/i;

/** True when the visitor wrote something that carries information. */
export function meaningful(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const t = v.trim();
  return t.length >= 2 && !NONANSWER.test(t);
}

/** Booleans arrive as true/false from the database, "true"/"yes" from older rows, null when skipped. */
export function asBool(v: unknown): boolean | null {
  if (v === true || v === "true" || v === "yes" || v === "Yes") return true;
  if (v === false || v === "false" || v === "no" || v === "No") return false;
  return null;
}

/** "1,200", "5k", "3.5" -> number. null when there is no number. */
export function parseCount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const m = v.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(k|m)?\b/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2]?.toLowerCase();
  return unit === "k" ? n * 1_000 : unit === "m" ? n * 1_000_000 : n;
}

/** "20%", "about 35 %", "35" -> 20 / 35 / 35. "24 hours", "Not sure" -> null. */
export function parsePercent(v: unknown): number | null {
  if (typeof v === "number") return v >= 0 && v <= 100 ? v : null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  const pct = t.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct) return Math.min(100, parseFloat(pct[1]));
  if (/^\d+(?:\.\d+)?$/.test(t)) { const n = parseFloat(t); return n <= 100 ? n : null; }
  return null;
}

const UNIT_MINUTES: Array<[RegExp, number]> = [
  [/^(m|min|mins|minute|minutes)$/, 1],
  [/^(h|hr|hrs|hour|hours)$/, 60],
  [/^(d|day|days)$/, 1440],
  [/^(w|wk|wks|week|weeks)$/, 10080],
];

/**
 * How long the visitor says it takes to respond, in minutes. Ranges use their slow end
 * ("1-4 hours" -> 240) so we never flatter the business. null when unreadable.
 */
export function parseResponseMinutes(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const t = v.toLowerCase().trim();
  if (!t) return null;
  if (t === "more_than_24_hours") return 2000;
  if (/\b(immediate|immediately|instant|instantly|right away|straight away|asap|real[- ]?time|automat)/.test(t)) return 1;
  if (/\b(few|couple( of)?) minutes?\b/.test(t)) return 5;
  if (/\b(few|couple( of)?) hours?\b/.test(t)) return 180;
  if (/\bsame[- ]day\b|\bwithin the day\b|\bend of (the )?day\b/.test(t)) return 480;
  if (/\bnext (business |working )?day\b|\bnext day\b|\bovernight\b/.test(t)) return 1440;
  const m = t.match(/(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*([a-z]+)/);
  if (m) {
    const n = parseFloat(m[2] ?? m[1]);
    const unit = UNIT_MINUTES.find(([re]) => re.test(m[3]));
    if (unit) return n * unit[1];
  }
  if (/\bweek\b/.test(t)) return 10080;
  return null;
}

/** Years since the website was last updated. Infinity = never had one. null = unreadable. */
export function parseWebsiteAgeYears(v: unknown, now: Date = new Date()): number | null {
  if (typeof v !== "string") return null;
  const t = v.toLowerCase().trim();
  if (!t) return null;
  if (t === "more_than_2_years") return 3;
  if (/\b(never|no website|don'?t have|do not have|haven'?t)\b/.test(t)) return Infinity;
  const year = t.match(/\b(19|20)\d{2}\b/);
  if (year) return Math.max(0, now.getUTCFullYear() - parseInt(year[0], 10));
  const m = t.match(/(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(year|yr|month|mo|week|wk)/);
  if (m) {
    const n = parseFloat(m[2] ?? m[1]);
    if (/^(year|yr)/.test(m[3])) return n;
    if (/^(month|mo)/.test(m[3])) return n / 12;
    return n / 52;
  }
  if (/\blast year\b/.test(t)) return 1;
  if (/\b(this year|recent|recently|just|currently|new|few weeks|this month)\b/.test(t)) return 0.25;
  return null;
}

export type Cadence = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "never";

/** "Weekly", "every month", "rarely" -> a cadence. When several are written, the most frequent wins. */
export function parseCadence(v: unknown): Cadence | null {
  if (typeof v !== "string") return null;
  const t = v.toLowerCase();
  if (/\bdaily\b|\bevery day\b|\beach day\b/.test(t)) return "daily";
  if (/\bweekly\b|\bevery week\b|\beach week\b|\bbi-?weekly\b|\bfortnight/.test(t)) return "weekly";
  if (/\bmonthly\b|\bevery month\b|\bonce a month\b|\beach month\b/.test(t)) return "monthly";
  if (/\bquarter/.test(t)) return "quarterly";
  if (/\bannual|\byearly\b|\bevery year\b|\bonce a year\b/.test(t)) return "yearly";
  if (/\b(never|rarely|seldom|hardly|not really|don'?t|do not)\b/.test(t)) return "never";
  return null;
}

export type Confidence = "high" | "medium" | "low";

export function parseConfidence(v: unknown): Confidence | null {
  if (typeof v === "number") return v >= 70 ? "high" : v >= 40 ? "medium" : "low";
  if (typeof v !== "string") return null;
  const t = v.toLowerCase().trim();
  if (!t) return null;
  const pct = parsePercent(t);
  if (pct !== null) return pct >= 70 ? "high" : pct >= 40 ? "medium" : "low";
  if (/\bnot (at all |very |really )?(confident|sure|accurate|trust)|\bno confidence\b|\blow\b|\bunsure\b|\bpoor\b|\bdon'?t trust\b|\bnot at all\b/.test(t)) return "low";
  if (/\bvery\b|\bhigh\b|\bextremely\b|\bfully\b|\bcompletely\b|\bstrong\b|\b100\b/.test(t)) return "high";
  if (/\bsomewhat\b|\bmedium\b|\bmoderate\b|\bmostly\b|\bfairly\b|\bok\b|\bokay\b|\bconfident\b/.test(t)) return "medium";
  return null;
}

// ---------------------------------------------------------------- rubric

interface Item {
  /** Points available. */
  max: number;
  /** Points earned, or null when the question wasn't answered / couldn't be read. */
  earned: number | null;
  /** False when the question doesn't apply to this business (excluded from the category maximum). */
  applies?: boolean;
}

const yes = (v: unknown, max: number): Item => {
  const b = asBool(v);
  return { max, earned: b === null ? null : b ? max : 0 };
};

const banded = (value: number | null, bands: Array<[number, number]>, max: number): Item => {
  if (value === null) return { max, earned: null };
  for (const [threshold, points] of bands) if (value >= threshold) return { max, earned: points };
  return { max, earned: 0 };
};

function category(key: CategoryKey, label: string, items: Item[]): SystemScore {
  const live = items.filter((i) => i.applies !== false);
  const total = live.reduce((s, i) => s + i.max, 0);
  const earned = live.reduce((s, i) => s + (i.earned ?? 0), 0);
  const answered = live.filter((i) => i.earned !== null).length;
  const score = total > 0 ? Math.round((earned / total) * 100) : 0;
  const { status, color } = statusFor(score);
  return { category: key, label, score, status, color, answered, total: live.length };
}

export function statusFor(score: number): { status: ScoreStatus; color: string } {
  if (score >= 70) return { status: "strong", color: "bg-green-500" };
  if (score >= 50) return { status: "moderate", color: "bg-yellow-500" };
  if (score >= 30) return { status: "weak", color: "bg-orange-500" };
  return { status: "critical", color: "bg-red-500" };
}

// deno-lint-ignore no-explicit-any
type Answers = Record<string, any>;

export function calculateSystemScorecard(g: Answers, now: Date = new Date()): SystemScorecard {
  const runsAds = asBool(g.running_paid_ads) === true;

  // S, Search & Visibility: can people find you?
  const search = category("S", "Search & Visibility", [
    yes(g.investing_in_seo, 20),
    yes(g.ranking_for_keywords, 20),
    yes(g.tracking_keyword_rankings, 15),
    yes(g.knows_organic_traffic, 10),
    banded(parseCount(g.monthly_organic_traffic), [[1000, 15], [100, 10], [1, 5]], 15),
    { max: 10, earned: meaningful(g.top_competitors) ? 10 : null },
    yes(g.running_paid_ads, 10),
  ]);

  // Y, Yield Optimization: does the website turn visitors into leads?
  const age = parseWebsiteAgeYears(g.website_last_updated, now);
  const yieldCat = category("Y", "Yield Optimization", [
    yes(g.tracks_website_conversions, 30),
    banded(parseCount(g.monthly_website_leads), [[20, 25], [5, 18], [1, 8]], 25),
    age === null ? { max: 25, earned: null } : { max: 25, earned: age <= 1 ? 25 : age <= 2 ? 15 : age <= 3 ? 6 : 0 },
    { ...yes(g.ads_use_landing_pages, 20), applies: runsAds },
  ]);

  // S2, Sequence & Nurture: do leads get followed up automatically?
  const sequence = category("S2", "Sequence & Nurture", [
    yes(g.uses_email_automation, 25),
    yes(g.uses_sms_followups, 10),
    yes(g.has_crm, 20),
    yes(g.crm_tracks_all_inbound, 15),
    yes(g.has_segmentation_drip, 15),
    yes(g.has_abandoned_followups, 15),
  ]);

  // T, Transaction Activation: how fast and how well do you close?
  const minutes = parseResponseMinutes(g.lead_response_time);
  const close = parsePercent(g.close_rate);
  const transaction = category("T", "Transaction Activation", [
    minutes === null
      ? { max: 35, earned: null }
      : { max: 35, earned: minutes <= 15 ? 35 : minutes <= 60 ? 29 : minutes <= 240 ? 20 : minutes <= 480 ? 12 : minutes <= 1440 ? 5 : 0 },
    banded(close, [[30, 20], [20, 14], [10, 8], [1, 4]], 20),
    yes(g.uses_online_scheduling, 25),
    { max: 10, earned: meaningful(g.common_objections) ? 10 : null },
    { max: 10, earned: meaningful(g.where_prospects_lost) ? 10 : null },
  ]);

  // E, Engagement & Retention: do customers come back and speak up?
  const repeat = parsePercent(g.repeat_customer_rate);
  const engagement = category("E", "Engagement & Retention", [
    yes(g.asks_for_reviews, 20),
    banded(parseCount(g.monthly_new_reviews), [[5, 15], [1, 8]], 15),
    yes(g.has_reputation_tool, 10),
    yes(g.emails_past_customers, 20),
    yes(g.has_loyalty_referral_program, 15),
    yes(g.has_post_purchase_followup, 10),
    banded(repeat, [[30, 10], [15, 6], [1, 2]], 10),
  ]);

  // M, Metrics & Improvement: do you measure, and act on it?
  const confidence = parseConfidence(g.data_accuracy_confidence);
  const reviewCadence = parseCadence(g.analytics_review_frequency);
  const kpiCadence = parseCadence(g.kpi_tracking_frequency);
  const cadencePoints = (c: Cadence | null, top: number): Item =>
    c === null
      ? { max: top, earned: null }
      : { max: top, earned: c === "daily" || c === "weekly" ? top : c === "monthly" ? Math.round(top / 2) : c === "quarterly" ? Math.round(top / 5) : 0 };
  const metrics = category("M", "Metrics & Improvement", [
    yes(g.uses_google_analytics, 20),
    yes(g.knows_best_lead_sources, 20),
    { max: 10, earned: meaningful(g.kpis_tracked) ? 10 : null },
    confidence === null ? { max: 15, earned: null } : { max: 15, earned: confidence === "high" ? 15 : confidence === "medium" ? 8 : 0 },
    yes(g.does_ab_testing, 10),
    cadencePoints(reviewCadence, 15),
    cadencePoints(kpiCadence, 10),
  ]);

  const scores = [search, yieldCat, sequence, transaction, engagement, metrics];
  const overallScore = Math.round(scores.reduce((s, c) => s + c.score, 0) / scores.length);
  const answeredTotal = scores.reduce((s, c) => s + c.answered, 0);
  const questionTotal = scores.reduce((s, c) => s + c.total, 0);

  return {
    scores,
    overallScore,
    overallStatus: overallStatusFor(overallScore),
    coverage: questionTotal > 0 ? Math.round((answeredTotal / questionTotal) * 100) : 0,
    version: GAP_SCORE_VERSION,
  };
}

export function overallStatusFor(score: number): string {
  if (score >= 65) return "Good foundation - needs optimization";
  if (score >= 40) return "Moderate gaps - needs growth activation";
  return "Critical gaps - needs full system rebuild";
}

export function getStatusBadgeColor(status: string): string {
  switch (status) {
    case "strong": return "bg-green-100 text-green-800";
    case "moderate": return "bg-yellow-100 text-yellow-800";
    case "weak": return "bg-orange-100 text-orange-800";
    case "critical": return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-800";
  }
}
