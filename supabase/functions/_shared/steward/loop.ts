// deno-lint-ignore-file no-explicit-any
// The steward's reasoning loop. The model chooses which read tools to call and
// which actions to propose; this code owns everything else: step, action,
// token and time limits, argument validation, duplicate suppression, and what
// happens to each action (via deps.submit, which applies the autonomy gate).
// All I/O arrives through deps, so the loop is tested with a scripted model.
import type { ToolCall, ToolChatMessage } from "../ai.ts";
import { type InputSchema, validateArgs } from "../toolSchema.ts";
import type { ActionDef } from "./actions.ts";

export interface ReadTool {
  name: string;
  description: string;
  inputSchema: InputSchema;
  run(args: Record<string, any>): Promise<unknown>;
}

export interface ModelTurn { content: string | null; toolCalls: ToolCall[]; usage?: { prompt_tokens?: number; completion_tokens?: number } | null }
export type ToolChoice = "auto" | "required" | { type: "function"; function: { name: string } };

export interface StewardDeps {
  callModel(messages: ToolChatMessage[], tools: readonly unknown[], toolChoice: ToolChoice): Promise<ModelTurn>;
  submit(action: ActionDef, args: Record<string, any>, rationale: string, goalId: string | null): Promise<{ status: string; proposalId: string; message: string }>;
  now(): number;
  onStep?(step: number): Promise<void> | void;
}

export interface StewardLimits { maxSteps: number; maxActions: number; maxTokens: number; deadlineMs: number; maxToolChars: number }
export const DEFAULT_LIMITS: StewardLimits = { maxSteps: 12, maxActions: 5, maxTokens: 60_000, deadlineMs: 100_000, maxToolChars: 12_000 };

export interface StewardResult {
  status: "completed" | "stopped" | "failed";
  summary: string;
  stopReason?: string;
  steps: number;
  tokens: { prompt: number; completion: number };
  actions: { name: string; status: string; proposalId: string }[];
  trace: { step: number; tool: string; ok: boolean; note?: string }[];
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…[truncated]" : s);

function toolDef(name: string, description: string, schema: InputSchema) {
  return { type: "function", function: { name, description, parameters: schema } };
}

const FINISH_SCHEMA: InputSchema = { type: "object", required: ["summary"], properties: {
  summary: { type: "string", maxLength: 1200, description: "What you looked at, what you decided, and why. If you proposed nothing, say why that was right." },
} };

/** Action tools take the action's own arguments plus the reasoning that goes with the proposal. */
export function actionSchema(a: ActionDef): InputSchema {
  return {
    type: "object",
    required: [...(a.inputSchema.required ?? []), "rationale"],
    properties: {
      ...a.inputSchema.properties,
      rationale: { type: "string", maxLength: 1000, description: "Why this action, tied to a goal or to evidence you read" },
      goal_id: { type: "string", format: "uuid", description: "The goal this serves, if one applies" },
    },
  };
}

export async function runStewardLoop(input: {
  system: string;
  context: string;
  task: string;
  readTools: ReadTool[];
  actions: ActionDef[];
  deps: StewardDeps;
  limits?: Partial<StewardLimits>;
}): Promise<StewardResult> {
  const L = { ...DEFAULT_LIMITS, ...input.limits };
  const { deps } = input;
  const startedAt = deps.now();
  const tokens = { prompt: 0, completion: 0 };
  const actionsDone: StewardResult["actions"] = [];
  const trace: StewardResult["trace"] = [];
  const seenActions = new Set<string>();
  const reads = new Map(input.readTools.map((t) => [t.name, t]));
  const acts = new Map(input.actions.map((a) => [a.name, a]));

  const tools = [
    ...input.readTools.map((t) => toolDef(t.name, t.description, t.inputSchema)),
    ...input.actions.map((a) => toolDef(a.name, a.description, actionSchema(a))),
    toolDef("finish", "End this run. Call it when you have looked at what you need and proposed what is worth proposing, or when nothing needs doing.", FINISH_SCHEMA),
  ];
  const messages: ToolChatMessage[] = [
    { role: "system", content: input.system },
    { role: "user", content: `${input.context}\n\n${input.task}` },
  ];

  const out = (status: StewardResult["status"], summary: string, steps: number, stopReason?: string): StewardResult =>
    ({ status, summary, stopReason, steps, tokens, actions: actionsDone, trace });

  let step = 0;
  let wrapUp = false; // out of budget: the only call left is finish
  try {
    while (true) {
      if (!wrapUp && (step >= L.maxSteps - 1 || tokens.prompt + tokens.completion >= L.maxTokens || deps.now() - startedAt >= L.deadlineMs)) {
        wrapUp = true;
        messages.push({ role: "user", content: "You are out of budget for this run. Call finish now with your summary." });
      }
      if (step >= L.maxSteps) return out("stopped", "Stopped: step limit reached before the steward finished.", step, "step_limit");
      step++;
      await deps.onStep?.(step);

      const turn = await deps.callModel(messages, tools, wrapUp ? { type: "function", function: { name: "finish" } } : "required");
      tokens.prompt += turn.usage?.prompt_tokens ?? 0;
      tokens.completion += turn.usage?.completion_tokens ?? 0;

      if (turn.toolCalls.length === 0) {
        messages.push({ role: "assistant", content: turn.content ?? "" });
        messages.push({ role: "user", content: "Use a tool. Call finish when you are done." });
        continue;
      }
      messages.push({ role: "assistant", content: turn.content, tool_calls: turn.toolCalls });

      for (const call of turn.toolCalls) {
        const name = call.function.name;
        const reply = (content: string) => messages.push({ role: "tool", tool_call_id: call.id, content: clip(content, L.maxToolChars) });
        let args: Record<string, any>;
        try { args = JSON.parse(call.function.arguments || "{}"); } catch {
          trace.push({ step, tool: name, ok: false, note: "invalid JSON" });
          reply(JSON.stringify({ error: "The arguments were not valid JSON." }));
          continue;
        }

        if (name === "finish") {
          const summary = typeof args.summary === "string" && args.summary.trim() ? args.summary.trim() : "Finished without a summary.";
          trace.push({ step, tool: "finish", ok: true });
          return out("completed", summary, step);
        }

        const read = reads.get(name);
        if (read) {
          const bad = validateArgs(read.inputSchema, args);
          if (bad) { trace.push({ step, tool: name, ok: false, note: bad }); reply(JSON.stringify({ error: bad })); continue; }
          try {
            const result = await read.run(args);
            trace.push({ step, tool: name, ok: true });
            reply(JSON.stringify(result));
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            trace.push({ step, tool: name, ok: false, note: msg });
            reply(JSON.stringify({ error: msg }));
          }
          continue;
        }

        const action = acts.get(name);
        if (!action) {
          trace.push({ step, tool: name, ok: false, note: "unknown tool" });
          reply(JSON.stringify({ error: `unknown tool "${name}"` }));
          continue;
        }
        if (wrapUp) { reply(JSON.stringify({ error: "out of budget: call finish" })); continue; }
        if (actionsDone.length >= L.maxActions) {
          trace.push({ step, tool: name, ok: false, note: "action limit" });
          reply(JSON.stringify({ error: `You have already proposed ${L.maxActions} actions this run. Call finish.` }));
          continue;
        }
        const { rationale, goal_id, ...actionArgs } = args;
        const bad = validateArgs(actionSchema(action), args);
        if (bad) { trace.push({ step, tool: name, ok: false, note: bad }); reply(JSON.stringify({ error: bad })); continue; }
        const fingerprint = `${name}:${JSON.stringify(actionArgs, Object.keys(actionArgs).sort())}`;
        if (seenActions.has(fingerprint)) {
          reply(JSON.stringify({ error: "You already proposed exactly this action in this run." }));
          continue;
        }
        seenActions.add(fingerprint);
        try {
          const r = await deps.submit(action, actionArgs, rationale, goal_id ?? null);
          actionsDone.push({ name, status: r.status, proposalId: r.proposalId });
          trace.push({ step, tool: name, ok: r.status !== "failed", note: r.status });
          reply(JSON.stringify({ status: r.status, message: r.message }));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          trace.push({ step, tool: name, ok: false, note: msg });
          reply(JSON.stringify({ error: msg }));
        }
      }
    }
  } catch (e) {
    return out("failed", "The steward run failed.", step, e instanceof Error ? e.message : String(e));
  }
}
