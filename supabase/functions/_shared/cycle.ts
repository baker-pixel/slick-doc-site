// Work cycles: the pure planning/summary logic (unit-tested in cycle.test.ts)
// plus the small DB helpers start-client-cycle composes. A cycle is one paid
// billing period; see migration 20261013120000_client_cycles.sql.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { pipelineOnly } from "./campaignBoundary.ts";
import { collectRecentTopics } from "./topicLedger.ts";

export type CycleTrigger = "invoice_paid" | "sweep" | "manual";

export interface CycleRow {
  id: string;
  client_account_id: string;
  cycle_no: number;
  period_start: string;
  period_end: string;
  status: "planning" | "active" | "closed" | "failed";
  plan: Record<string, any>;
  digest: Record<string, any> | null;
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

// ─── Stripe invoice -> period ────────────────────────────────────────────────

/** Only the first invoice and renewals start a cycle; mid-period proration
 * invoices (plan changes) and manual invoices must not. */
export function isCycleInvoice(inv: { billing_reason?: string | null; status?: string | null }): boolean {
  return inv.status === "paid" &&
    (inv.billing_reason === "subscription_create" || inv.billing_reason === "subscription_cycle");
}

/** The billed period of a subscription invoice: the line with the longest span
 * (ignores zero-length proration lines). Null if no usable line. */
export function periodFromInvoice(inv: any): { start: Date; end: Date } | null {
  let best: { start: number; end: number } | null = null;
  for (const l of inv?.lines?.data ?? []) {
    const s = l?.period?.start, e = l?.period?.end;
    if (typeof s !== "number" || typeof e !== "number" || e <= s) continue;
    if (!best || e - s > best.end - best.start) best = { start: s, end: e };
  }
  return best ? { start: new Date(best.start * 1000), end: new Date(best.end * 1000) } : null;
}

/**
 * Window for a sweep-created cycle (no invoice in hand): runs from the previous
 * cycle's end (or one month before the current period end for a first cycle)
 * to the account's current_period_end.
 */
export function sweepWindow(
  currentPeriodEnd: string | Date,
  previousEnd: string | Date | null,
): { start: Date; end: Date } {
  const end = new Date(currentPeriodEnd);
  const prev = previousEnd ? new Date(previousEnd) : null;
  const start = prev && prev < end ? prev : new Date(end.getTime() - MONTH_MS);
  return { start, end };
}

// ─── Digest ──────────────────────────────────────────────────────────────────

export interface ApprovalRow {
  status: string;
  platform?: string | null;
  title?: string | null;
  feedback?: string | null;
}

export interface SocialDigest {
  reviewed: number;
  approved: number;
  rejected: number;
  changes_requested: number;
  published: number;
  approval_rate: number | null;
  rejection_reasons: string[];
  by_platform: Record<string, { approved: number; rejected: number }>;
  topics_used: string[];
}

export function summarizeSocial(
  approvals: ApprovalRow[],
  published: number,
  topicsUsed: string[],
): SocialDigest {
  const by_platform: SocialDigest["by_platform"] = {};
  const reasons: string[] = [];
  let approved = 0, rejected = 0, changes = 0;
  for (const a of approvals) {
    const p = (a.platform ?? "unknown").toLowerCase();
    by_platform[p] ??= { approved: 0, rejected: 0 };
    if (a.status === "approved") { approved++; by_platform[p].approved++; }
    else if (a.status === "rejected") { rejected++; by_platform[p].rejected++; }
    else if (a.status === "changes_requested") changes++;
    if ((a.status === "rejected" || a.status === "changes_requested") && a.feedback?.trim()) {
      reasons.push(a.feedback.trim().slice(0, 200));
    }
  }
  const reviewed = approved + rejected + changes;
  return {
    reviewed,
    approved,
    rejected,
    changes_requested: changes,
    published,
    approval_rate: reviewed > 0 ? Math.round((100 * approved) / reviewed) : null,
    rejection_reasons: reasons.slice(0, 10),
    by_platform,
    topics_used: topicsUsed,
  };
}

export interface ProspectRow {
  status: string;
  replied_at?: string | null;
  converted_at?: string | null;
  opened_at?: string | null;
  business_type?: string | null;
}

export interface ProspectDigest {
  discovered: number;
  contacted: number;
  opened: number;
  replied: number;
  converted: number;
  replied_types: string[];
  converted_types: string[];
}

/** `rows` = prospects created in the cycle window. */
export function summarizeProspects(rows: ProspectRow[]): ProspectDigest {
  const uniq = (xs: Array<string | null | undefined>) => [...new Set(xs.filter((x): x is string => !!x))].slice(0, 8);
  return {
    discovered: rows.length,
    contacted: rows.filter((r) => r.status !== "discovered" && r.status !== "rejected").length,
    opened: rows.filter((r) => !!r.opened_at).length,
    replied: rows.filter((r) => !!r.replied_at).length,
    converted: rows.filter((r) => !!r.converted_at || r.status === "converted").length,
    replied_types: uniq(rows.filter((r) => r.replied_at).map((r) => r.business_type)),
    converted_types: uniq(rows.filter((r) => r.converted_at || r.status === "converted").map((r) => r.business_type)),
  };
}

/** Short, factual takeaways shown to the client and fed to the next plan.
 * Deterministic on purpose: no LLM, so nothing here can be invented. */
export function buildLearned(social: SocialDigest | null, prospect: ProspectDigest | null): string[] {
  const out: string[] = [];
  if (social && social.reviewed > 0) {
    out.push(`${social.approved} of ${social.reviewed} reviewed posts were approved${social.approval_rate !== null ? ` (${social.approval_rate}%)` : ""}.`);
    for (const r of social.rejection_reasons.slice(0, 3)) out.push(`Client feedback: ${r}`);
    const platforms = Object.entries(social.by_platform).filter(([, v]) => v.rejected > v.approved);
    for (const [p] of platforms) out.push(`More ${p} posts were rejected than approved -- adjust that channel's angle.`);
  }
  if (social && social.published > 0) out.push(`${social.published} posts were published.`);
  if (prospect && prospect.discovered > 0) {
    out.push(`${prospect.discovered} prospects discovered, ${prospect.replied} replied, ${prospect.converted} converted.`);
    if (prospect.replied_types.length) out.push(`Replies came from: ${prospect.replied_types.join(", ")}.`);
  }
  return out;
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

/**
 * Idempotently opens the cycle for (client, period_end). Returns the existing
 * row when one is already there (`created:false`) -- webhook retries, the sweep
 * and manual runs all converge. Retries once if two writers race for cycle_no.
 */
export async function openCycle(
  supabase: SupabaseClient,
  clientId: string,
  window: { start: Date; end: Date },
  source: CycleTrigger,
  stripeInvoiceId: string | null,
): Promise<{ cycle: CycleRow; created: boolean }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: existing, error: selErr } = await supabase
      .from("client_cycles").select("*")
      .eq("client_account_id", clientId).eq("period_end", window.end.toISOString()).maybeSingle();
    if (selErr) throw selErr;
    if (existing) return { cycle: existing as CycleRow, created: false };

    const { data: last } = await supabase
      .from("client_cycles").select("cycle_no")
      .eq("client_account_id", clientId).order("cycle_no", { ascending: false }).limit(1).maybeSingle();

    const { data: inserted, error } = await supabase.from("client_cycles").insert({
      client_account_id: clientId,
      cycle_no: (last?.cycle_no ?? 0) + 1,
      period_start: window.start.toISOString(),
      period_end: window.end.toISOString(),
      trigger_source: source,
      stripe_invoice_id: stripeInvoiceId,
    }).select("*").single();
    if (!error) return { cycle: inserted as CycleRow, created: true };
    if (error.code !== "23505") throw error;
    // Lost a race (same period_end or same cycle_no): loop and re-read.
  }
  throw new Error(`openCycle: could not open cycle for client ${clientId}`);
}

/** Digest for a cycle, from what actually happened inside its window. */
export async function computeDigest(supabase: SupabaseClient, cycle: CycleRow) {
  const clientId = cycle.client_account_id;
  const from = cycle.period_start, to = cycle.period_end;

  const [approvals, published, calendar, prospects] = await Promise.all([
    supabase.from("content_approvals").select("status, platform, title, feedback")
      .eq("client_account_id", clientId).gte("reviewed_at", from).lt("reviewed_at", to),
    supabase.from("content_calendar").select("id", { count: "exact", head: true })
      .eq("client_account_id", clientId).eq("status", "published")
      .gte("scheduled_for", from).lt("scheduled_for", to),
    supabase.from("content_calendar").select("title, metadata")
      .eq("client_account_id", clientId).gte("scheduled_for", from).lt("scheduled_for", to)
      .not("content", "like", "[Auto-generated placeholder%"),
    pipelineOnly(supabase.from("prospects").select("status, replied_at, converted_at, opened_at, business_type")
      .eq("client_id", clientId)).gte("created_at", from).lt("created_at", to),
  ]);

  const social = summarizeSocial(
    (approvals.data ?? []) as ApprovalRow[],
    published.count ?? 0,
    collectRecentTopics(calendar.data ?? [], 60),
  );
  const prospect = summarizeProspects((prospects.data ?? []) as ProspectRow[]);
  return { social, prospect, learned: buildLearned(social, prospect), computed_at: new Date().toISOString() };
}

/** Closes a cycle: writes its digest and flips status. Safe to call twice. */
export async function closeCycle(supabase: SupabaseClient, cycle: CycleRow) {
  const digest = await computeDigest(supabase, cycle);
  const { error } = await supabase.from("client_cycles").update({
    digest,
    status: "closed",
    closed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", cycle.id);
  if (error) throw error;
  return digest;
}
