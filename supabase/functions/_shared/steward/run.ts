// deno-lint-ignore-file no-explicit-any
// One wake of one steward, end to end: decide whether it may run (enabled,
// budget, no overlapping run, slot not already taken), load the client brain,
// run the loop, and leave a complete record in steward_runs.
import { callAIWithTools, MODELS } from "../ai.ts";
import { type Engine, contextToPrompt, getClientContext } from "../clientContext.ts";
import type { Autonomy } from "./gate.ts";
import { runStewardLoop, type StewardDeps, type StewardLimits, type StewardResult } from "./loop.ts";
import { submitAction } from "./proposals.ts";
import { seoSteward } from "./seo.ts";

/** Engines with a working steward. Others are refused, not silently ignored. */
export const BUILT_ENGINES: readonly Engine[] = ["seo"];
export const STALE_RUN_MS = 10 * 60_000;
export const PROMPT_VERSION = "steward.v1";

export type Trigger = "manual" | "heartbeat" | "event";
export interface RunRequest { clientId: string; engine: Engine; trigger: Trigger }
export type RunResponse =
  | { ran: false; reason: string }
  | { ran: true; runId: string; autonomy: Autonomy; status: StewardResult["status"]; summary: string; actions: StewardResult["actions"]; steps: number };

/** Heartbeat and event wakes share one slot per hour, so a retried or duplicated trigger cannot run twice. Manual runs always get their own. */
export function slotKey(engine: string, clientId: string, trigger: Trigger, now: Date, nonce: string): string {
  if (trigger === "manual") return `manual:${engine}:${clientId}:${nonce}`;
  return `${engine}:${clientId}:${now.toISOString().slice(0, 13)}`;
}

export function startOfUtcDay(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function stewardFor(engine: Engine, supabase: any, clientId: string) {
  if (engine === "seo") return seoSteward(supabase, clientId);
  throw new Error(`no steward for ${engine}`);
}

export async function runSteward(
  supabase: any,
  req: RunRequest,
  opts: { limits?: Partial<StewardLimits>; callModel?: StewardDeps["callModel"]; now?: () => number } = {},
): Promise<RunResponse> {
  const now = opts.now ?? Date.now;
  const { clientId, engine, trigger } = req;
  if (!BUILT_ENGINES.includes(engine)) return { ran: false, reason: `the ${engine} steward is not built yet` };

  const { data: client } = await supabase.from("client_accounts")
    .select("id, status, paused_for_billing").eq("id", clientId).maybeSingle();
  if (!client) return { ran: false, reason: "client not found" };
  if (trigger !== "manual" && (client.status !== "active" || client.paused_for_billing)) {
    return { ran: false, reason: "client is not active" };
  }

  const { data: settings } = await supabase.from("steward_settings")
    .select("enabled, autonomy, daily_token_budget").eq("client_account_id", clientId).eq("engine", engine).maybeSingle();
  const enabled = settings?.enabled ?? false;
  const autonomy: Autonomy = settings?.autonomy ?? "shadow";
  const budget: number = settings?.daily_token_budget ?? 200_000;
  // A person triggering a run by hand may try a steward that is not switched on; the schedule may not.
  if (trigger !== "manual" && !enabled) return { ran: false, reason: "steward is not enabled for this client" };

  // Runs that stopped reporting in are dead, whatever they say. Free the slot.
  await supabase.from("steward_runs")
    .update({ status: "failed", error: "timed out: no heartbeat", finished_at: new Date(now()).toISOString() })
    .eq("client_account_id", clientId).eq("engine", engine).eq("status", "running")
    .lt("heartbeat_at", new Date(now() - STALE_RUN_MS).toISOString());
  const { data: live } = await supabase.from("steward_runs").select("id")
    .eq("client_account_id", clientId).eq("engine", engine).eq("status", "running").limit(1);
  if (live?.length) return { ran: false, reason: "another run is in progress" };

  const { data: today } = await supabase.from("steward_runs").select("prompt_tokens, completion_tokens")
    .eq("client_account_id", clientId).eq("engine", engine).gte("started_at", startOfUtcDay(new Date(now())));
  const used = (today ?? []).reduce((n: number, r: any) => n + (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0), 0);
  if (used >= budget) return { ran: false, reason: `daily token budget used (${used} of ${budget})` };

  const { data: run, error: insertErr } = await supabase.from("steward_runs").insert({
    client_account_id: clientId, engine, trigger, autonomy,
    slot_key: slotKey(engine, clientId, trigger, new Date(now()), crypto.randomUUID()),
  }).select("id").single();
  if (insertErr?.code === "23505") return { ran: false, reason: "this wake was already handled" };
  if (insertErr || !run) throw new Error(insertErr?.message ?? "could not create the run");

  const finish = async (patch: Record<string, unknown>) => {
    await supabase.from("steward_runs").update({ ...patch, finished_at: new Date(now()).toISOString() }).eq("id", run.id);
  };

  try {
    const ctx = await getClientContext(supabase, clientId, { engine });
    if (!ctx) { await finish({ status: "failed", error: "client context unavailable" }); return { ran: false, reason: "client context unavailable" }; }

    const steward = stewardFor(engine, supabase, clientId);
    const deps: StewardDeps = {
      callModel: opts.callModel ?? (async (messages, tools, toolChoice) => {
        const t = await callAIWithTools({
          messages, tools, toolChoice, model: MODELS.default, maxTokens: 1500, temperature: 0.2,
          source: `steward-${engine}`, clientId, promptId: `${PROMPT_VERSION}.${engine}`,
        });
        return { content: t.content, toolCalls: t.toolCalls, usage: t.usage };
      }),
      submit: (action, args, rationale, goalId) =>
        submitAction(supabase, { runId: run.id, clientId, action, args, rationale, goalId, autonomy }),
      now,
      onStep: async (step) => {
        await supabase.from("steward_runs").update({ step_count: step, heartbeat_at: new Date(now()).toISOString() }).eq("id", run.id);
      },
    };

    const result = await runStewardLoop({
      system: steward.system, task: steward.task, context: contextToPrompt(ctx, 5000),
      readTools: steward.readTools, actions: steward.actions, deps, limits: opts.limits,
    });

    await finish({
      status: result.status === "failed" ? "failed" : result.status === "stopped" ? "stopped" : "completed",
      summary: result.summary, error: result.stopReason && result.status === "failed" ? result.stopReason : null,
      step_count: result.steps, prompt_tokens: result.tokens.prompt, completion_tokens: result.tokens.completion,
      state: { trace: result.trace, actions: result.actions, stopReason: result.stopReason ?? null, contextGaps: ctx.gaps },
    });
    return { ran: true, runId: run.id, autonomy, status: result.status, summary: result.summary, actions: result.actions, steps: result.steps };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finish({ status: "failed", error: msg.slice(0, 500) });
    throw e;
  }
}
