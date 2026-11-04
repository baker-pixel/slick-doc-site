// Pure logic behind the client portal's Lead Outreach insights: the funnel,
// the "what is the engine doing" status, and the engine's schedule. Kept free
// of React/Supabase so it is easy to reason about and reuse.

/** Minimal prospect shape the insights need (a subset of the tab's Prospect). */
export interface InsightProspect {
  status: string;
  drip_step: number;
  opened_at: string | null;
  clicked_at: string | null;
  replied_at: string | null;
}

// --- Engine constants mirrored from the backend ------------------------------
// supabase/functions/auto-discover-prospects: daily sweep at 09:00 UTC, and it
// pauses a client once this many leads wait for review.
export const DISCOVERY_HOUR_UTC = 9;
export const REVIEW_QUEUE_CEILING = 40;
// supabase/functions/_shared/tierPolicy.ts (prospect.*). Keep in sync.
export const PROSPECT_TIER_POLICY: Record<string, { enabled: boolean; discoveryBatch: number; dailySendCap: number }> = {
  foundation: { enabled: false, discoveryBatch: 0, dailySendCap: 0 },
  growth: { enabled: true, discoveryBatch: 10, dailySendCap: 40 },
  transformation: { enabled: true, discoveryBatch: 20, dailySendCap: 80 },
};

export function prospectPolicy(tier: string | null | undefined) {
  return PROSPECT_TIER_POLICY[(tier ?? "").toLowerCase().trim()] ?? PROSPECT_TIER_POLICY.foundation;
}

/** The next daily discovery sweep (09:00 UTC) strictly after `now`. */
export function nextDiscoveryRun(now: Date = new Date()): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), DISCOVERY_HOUR_UTC));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

// --- Funnel -------------------------------------------------------------------
const SENT_TERMINAL = new Set(["replied", "converted", "exhausted", "bounced", "unsubscribed"]);

export interface FunnelStage {
  key: "found" | "approved" | "contacted" | "opened" | "clicked" | "replied";
  label: string;
  hint: string;
  count: number;
}

/** True once at least one email has actually gone out to this lead. */
export function wasContacted(p: InsightProspect): boolean {
  if (p.status === "discovered" || p.status === "rejected" || p.status === "pending") return false;
  return p.drip_step >= 1 || SENT_TERMINAL.has(p.status);
}

export function funnelStages(prospects: InsightProspect[]): FunnelStage[] {
  const found = prospects.length;
  const approved = prospects.filter((p) => p.status !== "discovered" && p.status !== "rejected").length;
  const contacted = prospects.filter(wasContacted);
  const opened = contacted.filter((p) => p.opened_at).length;
  const clicked = contacted.filter((p) => p.clicked_at).length;
  const replied = prospects.filter((p) => p.status === "replied" || p.status === "converted" || (p.replied_at && wasContacted(p))).length;
  return [
    { key: "found", label: "Found", hint: "Leads matched to your ideal customer profile", count: found },
    { key: "approved", label: "Approved", hint: "Reviewed and cleared for outreach", count: approved },
    { key: "contacted", label: "Emailed", hint: "Received at least one email", count: contacted.length },
    { key: "opened", label: "Opened", hint: "Opened an email (an estimate: some mail apps hide opens)", count: opened },
    { key: "clicked", label: "Clicked", hint: "Clicked a link in an email", count: clicked },
    { key: "replied", label: "Replied", hint: "Wrote back, or converted", count: replied },
  ];
}

// --- Engine status ------------------------------------------------------------
export type EngineState = "running" | "paused" | "blocked";

export interface EngineStatusInput {
  tier: string | null;
  hasMailbox: boolean | null;
  awaitingReview: number;
  pendingQueue: number;
  sent24h: number;
  lastDiscoveryAt: string | null;
  now?: Date;
}

export interface EngineStatus {
  state: EngineState;
  headline: string;
  detail: string;
  dailySendCap: number;
  dailyBatch: number;
}

const HOUR = 3_600_000;

export function engineStatus(i: EngineStatusInput): EngineStatus {
  const now = i.now ?? new Date();
  const policy = prospectPolicy(i.tier);
  const base = { dailySendCap: policy.dailySendCap, dailyBatch: policy.discoveryBatch };

  if (!policy.enabled) {
    return { ...base, state: "blocked", headline: "Lead outreach isn't part of your current plan",
      detail: "Upgrade your plan to have Orange Door find and contact leads for you." };
  }
  if (i.hasMailbox === false) {
    return { ...base, state: "blocked", headline: "Paused: connect your email inbox",
      detail: "Every outreach email is sent from your own address, so searching for leads and sending are on hold until a mailbox is connected." };
  }
  if (i.awaitingReview >= REVIEW_QUEUE_CEILING) {
    return { ...base, state: "paused", headline: `Finding new leads is paused: ${i.awaitingReview} are waiting for review`,
      detail: `The daily search pauses at ${REVIEW_QUEUE_CEILING} unreviewed leads so effort isn't wasted. It resumes automatically once the Orange Door team has reviewed them.` };
  }
  const sinceDiscovery = i.lastDiscoveryAt ? now.getTime() - new Date(i.lastDiscoveryAt).getTime() : null;
  if (sinceDiscovery !== null && sinceDiscovery > 36 * HOUR) {
    return { ...base, state: "running", headline: "Running, but the last searches found nothing new",
      detail: "Your ideal customer profile may be narrow, so recent daily searches turned up no fresh leads. Broadening it (below) usually helps." };
  }
  if (i.pendingQueue === 0 && i.awaitingReview === 0 && i.lastDiscoveryAt === null) {
    return { ...base, state: "running", headline: "Running: waiting for the first search",
      detail: "The next daily search will look for leads that match your ideal customer profile." };
  }
  return { ...base, state: "running", headline: "Running", detail: "Leads are searched for daily and emailed in a spaced-out sequence from your own address." };
}

// --- Timeline -----------------------------------------------------------------
export interface ActivityRow {
  id: string;
  activity_type: string;
  title: string;
  description: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export const OUTREACH_ACTIVITY_TYPES = ["prospect_discovery", "prospect_outreach", "prospect_replied"] as const;

/** Groups rows (newest first) under a local calendar-day key, preserving order. */
export function groupByDay<T extends { created_at: string }>(rows: T[]): { day: string; rows: T[] }[] {
  const out: { day: string; rows: T[] }[] = [];
  for (const r of rows) {
    const d = new Date(r.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const last = out[out.length - 1];
    if (last && last.day === key) last.rows.push(r);
    else out.push({ day: key, rows: [r] });
  }
  return out;
}

/** Collapses runs of same-day "email sent" rows into one line so the feed stays readable. */
export function summarizeActivity(rows: ActivityRow[]): ActivityRow[] {
  const out: ActivityRow[] = [];
  const sentIdx = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.activity_type !== "prospect_outreach") { out.push(r); continue; }
    const key = new Date(r.created_at).toDateString();
    if (!sentIdx.has(key)) {
      sentIdx.set(key, out.length);
      counts.set(key, 1);
      out.push({ ...r });
    } else {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  for (const [key, idx] of sentIdx) {
    const n = counts.get(key) ?? 1;
    out[idx] = {
      ...out[idx],
      title: n === 1 ? "Outreach email sent" : `${n} outreach emails sent`,
      description: n === 1 ? out[idx].description : null,
    };
  }
  return out;
}
