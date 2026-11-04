// deno-lint-ignore-file no-explicit-any
// The proposal lifecycle. A steward's action becomes an agent_proposals row;
// the gate decides whether it is only recorded, waits for a person, or runs.
// Whoever runs it first must win an atomic claim on the row, so an approval
// click and an auto-run can never both execute the same action.
import { validateArgs } from "../toolSchema.ts";
import { type ActionDef, findAction } from "./actions.ts";
import { type Autonomy, dispositionFor } from "./gate.ts";

export type SubmitStatus = "recorded" | "queued" | "executed" | "failed";
export interface SubmitResult { status: SubmitStatus; proposalId: string; message: string }

export interface SubmitInput {
  runId: string | null;
  clientId: string;
  action: ActionDef;
  args: Record<string, any>;
  rationale: string;
  goalId?: string | null;
  autonomy: Autonomy;
}

/** Records the action as a proposal and, when the gate allows, runs it. Throws only on invalid input or a database failure. */
export async function submitAction(supabase: any, i: SubmitInput): Promise<SubmitResult> {
  const bad = validateArgs(i.action.inputSchema, i.args);
  if (bad) throw new Error(bad);

  const disposition = dispositionFor(i.autonomy, i.action.sideEffect, !!i.action.execute);
  const { data: row, error } = await supabase.from("agent_proposals").insert({
    client_account_id: i.clientId, engine: i.action.engine, run_id: i.runId, goal_id: i.goalId ?? null,
    tool: i.action.name, args: i.args, summary: i.action.summarize(i.args), rationale: i.rationale.slice(0, 1000),
    side_effect: i.action.sideEffect, status: disposition === "record_only" ? "shadow" : "pending",
  }).select("id").single();
  if (error || !row) throw new Error(error?.message ?? "could not record the proposal");

  if (disposition === "record_only") return { status: "recorded", proposalId: row.id, message: "Recorded for review. Shadow mode never acts." };
  if (disposition === "queue") return { status: "queued", proposalId: row.id, message: "Queued for a person to approve." };

  const out = await runProposal(supabase, row.id, { decidedBy: null, note: `auto (${i.autonomy})` });
  return out.ok
    ? { status: "executed", proposalId: row.id, message: "Executed." }
    : { status: "failed", proposalId: row.id, message: `Could not run: ${out.error}` };
}

export type RunOutcome = { ok: true; status: "executed" | "approved"; result?: unknown } | { ok: false; error: string };

/**
 * Claims a pending proposal and carries it out. Advisory actions end as
 * "approved" (a person does the work); executable ones end "executed" or "failed".
 */
export async function runProposal(supabase: any, proposalId: string, by: { decidedBy: string | null; note?: string }): Promise<RunOutcome> {
  const { data: claimed, error } = await supabase.from("agent_proposals")
    .update({ status: "approved", decided_by: by.decidedBy, decided_at: new Date().toISOString(), decision_note: by.note ?? null })
    .eq("id", proposalId).eq("status", "pending")
    .select("id, client_account_id, tool, args");
  if (error) return { ok: false, error: error.message };
  const p = claimed?.[0];
  if (!p) return { ok: false, error: "this proposal was already decided" };

  const action = findAction(p.tool);
  if (!action) {
    await markFailed(supabase, p.id, `unknown action "${p.tool}"`);
    return { ok: false, error: `unknown action "${p.tool}"` };
  }
  if (!action.execute) return { ok: true, status: "approved" };

  try {
    const result = await action.execute({ supabase, clientId: p.client_account_id, proposalId: p.id }, p.args ?? {});
    await supabase.from("agent_proposals").update({ status: "executed", result: result ?? null }).eq("id", p.id);
    return { ok: true, status: "executed", result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markFailed(supabase, p.id, msg);
    return { ok: false, error: msg };
  }
}

async function markFailed(supabase: any, id: string, message: string) {
  await supabase.from("agent_proposals").update({ status: "failed", result: { error: message } }).eq("id", id);
}

export interface DecideInput {
  proposalId: string;
  decision: "approve" | "reject";
  note?: string;
  actorUserId: string | null;
  /** null = may decide for any client */
  allowedClientIds: readonly string[] | null;
}

/** A person's decision on a pending proposal. A rejection note becomes memory, so the steward learns from it. */
export async function decideProposal(supabase: any, i: DecideInput): Promise<RunOutcome | { ok: true; status: "rejected" }> {
  const { data: p } = await supabase.from("agent_proposals")
    .select("id, client_account_id, engine, summary, status, goal_id").eq("id", i.proposalId).maybeSingle();
  // Same answer for "missing" and "not yours", so ids cannot be probed.
  if (!p || (i.allowedClientIds && !i.allowedClientIds.includes(p.client_account_id))) return { ok: false, error: "proposal not found" };
  if (p.status !== "pending") return { ok: false, error: `this proposal is ${p.status}, not pending` };

  if (i.decision === "approve") return await runProposal(supabase, p.id, { decidedBy: i.actorUserId, note: i.note });

  const { data: rejected, error } = await supabase.from("agent_proposals")
    .update({ status: "rejected", decided_by: i.actorUserId, decided_at: new Date().toISOString(), decision_note: i.note ?? null })
    .eq("id", p.id).eq("status", "pending").select("id");
  if (error) return { ok: false, error: error.message };
  if (!rejected?.length) return { ok: false, error: "this proposal was already decided" };

  if (i.note?.trim()) {
    await supabase.from("agent_memory").insert({
      client_account_id: p.client_account_id, engine: p.engine, goal_id: p.goal_id, kind: "observation",
      content: `A person rejected: ${p.summary}. Reason: ${i.note.trim().slice(0, 500)}`,
    });
  }
  return { ok: true, status: "rejected" };
}
