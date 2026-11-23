// deno-lint-ignore-file no-explicit-any
// The steward's feedback loop. A recommendation carries a prediction that code
// (not the model) builds from the audit it was based on. After its check date,
// the next audit is compared with that baseline and the proposal is scored:
//   hit          the issue now affects at most half the share of pages it did
//   miss         the issue affects the same share or more
//   inconclusive anything in between, a different crawl size, or no audit to judge by
// Each scored proposal leaves one "lesson" in agent_memory, which the steward
// reads on its next wake. Only approved proposals are scored, so a person
// agreeing is what puts a recommendation on the record.

export const CHECK_AFTER_DAYS = 14;
/** If no usable audit exists this long after the check date, the proposal is closed as inconclusive. */
export const GIVE_UP_AFTER_DAYS = 14;
/** An audit that read fewer than this share of the baseline's pages is not comparable. */
export const MIN_COVERAGE = 0.6;

export interface FixPrediction {
  kind: "seo_fix";
  check_id: string;
  baseline_audit_id: string;
  baseline_score: number | null;
  baseline_pages_affected: number;
  baseline_pages_analyzed: number;
  /** What counts as a hit, recorded so the standard cannot drift later. */
  expect: "affected_share_at_most_half";
  check_after: string;
}

export interface FixOutcome {
  audit_id: string | null;
  score: number | null;
  pages_affected: number | null;
  pages_analyzed: number | null;
  detail: string;
}

export function issuePages(findings: any[] | null | undefined, checkId: string): number {
  const pages = new Set<string>();
  for (const f of findings ?? []) if (f?.check_id === checkId) for (const p of f.pages ?? []) pages.add(p);
  return pages.size;
}

function analyzedCount(results: any): number {
  return Array.isArray(results?.pages_analyzed) ? results.pages_analyzed.filter((p: any) => p?.reachable !== false).length : 0;
}

/** Builds the prediction from the latest complete audit. Null when there is nothing sound to predict from. */
export async function buildFixPrediction(supabase: any, clientId: string, checkId: string, now = Date.now()): Promise<FixPrediction | null> {
  const { data: audit } = await supabase.from("seo_audits").select("id, score, results")
    .eq("client_account_id", clientId).eq("status", "complete").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!audit) return null;
  const affected = issuePages(audit.results?.findings, checkId);
  const analyzed = analyzedCount(audit.results);
  if (affected === 0 || analyzed === 0) return null;
  return {
    kind: "seo_fix", check_id: checkId, baseline_audit_id: audit.id, baseline_score: audit.score ?? null,
    baseline_pages_affected: affected, baseline_pages_analyzed: analyzed, expect: "affected_share_at_most_half",
    check_after: new Date(now + CHECK_AFTER_DAYS * 86_400_000).toISOString(),
  };
}

export type Verdict = { status: "hit" | "miss" | "inconclusive"; outcome: FixOutcome };

/** Pure: compares a later audit with the baseline in the prediction. */
export function judgeFix(p: FixPrediction, audit: { id: string; score: number | null; results: any } | null): Verdict {
  if (!audit) return { status: "inconclusive", outcome: { audit_id: null, score: null, pages_affected: null, pages_analyzed: null, detail: "no later audit was available to judge by" } };
  const affected = issuePages(audit.results?.findings, p.check_id);
  const analyzed = analyzedCount(audit.results);
  const base = { audit_id: audit.id, score: audit.score ?? null, pages_affected: affected, pages_analyzed: analyzed };
  if (analyzed < p.baseline_pages_analyzed * MIN_COVERAGE) {
    return { status: "inconclusive", outcome: { ...base, detail: `the later audit read ${analyzed} pages against ${p.baseline_pages_analyzed}, too different to compare` } };
  }
  const before = p.baseline_pages_affected / p.baseline_pages_analyzed;
  const after = analyzed > 0 ? affected / analyzed : 1;
  const where = `${p.baseline_pages_affected} of ${p.baseline_pages_analyzed} pages before, ${affected} of ${analyzed} after`;
  if (after <= before / 2) return { status: "hit", outcome: { ...base, detail: where } };
  if (after >= before) return { status: "miss", outcome: { ...base, detail: where } };
  return { status: "inconclusive", outcome: { ...base, detail: `improved but by less than half: ${where}` } };
}

/** Scores every approved, due, unscored prediction for one client. Returns how many were scored. */
export async function scoreDueProposals(supabase: any, clientId: string, now = Date.now()): Promise<number> {
  const { data: due } = await supabase.from("agent_proposals")
    .select("id, goal_id, summary, prediction, decided_at, created_at")
    .eq("client_account_id", clientId).eq("engine", "seo").eq("status", "approved")
    .not("prediction", "is", null).is("scored_at", null).limit(20);

  let scored = 0;
  for (const p of due ?? []) {
    const pred = p.prediction as FixPrediction;
    if (pred?.kind !== "seo_fix" || new Date(pred.check_after).getTime() > now) continue;

    // The audit must postdate the approval, or it cannot reflect the fix.
    const { data: audit } = await supabase.from("seo_audits").select("id, score, results, created_at")
      .eq("client_account_id", clientId).eq("status", "complete")
      .gt("created_at", p.decided_at ?? p.created_at).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const overdue = new Date(pred.check_after).getTime() + GIVE_UP_AFTER_DAYS * 86_400_000 <= now;
    if (!audit && !overdue) continue; // still waiting for the next audit

    const verdict = judgeFix(pred, audit ?? null);
    // Atomic claim: only one scorer may record the outcome and its lesson.
    const { data: claimed } = await supabase.from("agent_proposals")
      .update({ outcome: verdict.outcome, outcome_status: verdict.status, scored_at: new Date(now).toISOString() })
      .eq("id", p.id).is("scored_at", null).select("id");
    if (!claimed?.length) continue;

    await supabase.from("agent_memory").insert({
      client_account_id: clientId, engine: "seo", goal_id: p.goal_id, kind: "lesson",
      content: `${p.summary}: ${verdict.status.toUpperCase()}. ${verdict.outcome.detail}.`,
      rationale: "Scored automatically against the first audit after the check date.",
      outcome: { proposal_id: p.id, status: verdict.status, ...verdict.outcome },
    });
    scored++;
  }
  return scored;
}
