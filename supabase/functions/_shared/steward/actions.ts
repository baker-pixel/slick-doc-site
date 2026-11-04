// deno-lint-ignore-file no-explicit-any
// What a steward may DO, as opposed to read. Every action is either truly
// executable by code here, or explicitly advisory (a person carries it out and
// approval just records the decision). Nothing in this file pretends to act.
import type { InputSchema } from "../toolSchema.ts";
import type { Engine } from "../clientContext.ts";

export interface ExecEnv { supabase: any; clientId: string; proposalId: string }

export interface ActionDef {
  name: string;
  engine: Engine;
  description: string;
  sideEffect: "internal" | "external";
  inputSchema: InputSchema;
  /** One line for the approval queue. */
  summarize(args: Record<string, any>): string;
  /** Absent means advisory. */
  execute?: (env: ExecEnv, args: Record<string, any>) => Promise<unknown>;
}

/** An audit crawls the client's site and uses AI credits, so repeats inside this window are refused. */
export const AUDIT_COOLDOWN_MS = 6 * 3600_000;

export const SEO_ACTIONS: ActionDef[] = [
  {
    name: "run_seo_audit",
    engine: "seo",
    description: "Queue a fresh SEO audit of the client's site. Use when the latest audit is old, or after fixes were applied and you need to verify they worked. Refused if an audit finished in the last 6 hours.",
    sideEffect: "internal",
    inputSchema: { type: "object", required: ["reason"], properties: { reason: { type: "string", maxLength: 300, description: "Why a new audit is needed now" } } },
    summarize: () => "Run a fresh SEO audit",
    execute: async ({ supabase, clientId, proposalId }) => {
      const { data: last } = await supabase.from("seo_audits").select("created_at")
        .eq("client_account_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (last?.created_at && Date.now() - new Date(last.created_at).getTime() < AUDIT_COOLDOWN_MS) {
        throw new Error("an audit already finished in the last 6 hours");
      }
      const { error } = await supabase.rpc("agent_jobs_enqueue", {
        msg: { target: "seo-audit", idempotencyKey: `steward:${proposalId}`, body: { clientId } },
      });
      if (error) throw new Error(`could not queue the audit: ${error.message}`);
      return { queued: "seo-audit" };
    },
  },
  {
    name: "recommend_fix",
    engine: "seo",
    description: "Recommend fixing one issue type from the latest audit. Advisory: a person reviews it and applies the fix with the existing Apply tools; approving records that you were right to flag it. One recommendation per issue type.",
    sideEffect: "internal",
    inputSchema: { type: "object", required: ["check_id", "title", "priority", "steps"], properties: {
      check_id: { type: "string", maxLength: 80, description: "check_id exactly as get_audit shows it" },
      title: { type: "string", maxLength: 120 },
      priority: { type: "string", enum: ["high", "medium", "low"] },
      pages_affected: { type: "integer", minimum: 0, maximum: 1000 },
      steps: { type: "string", maxLength: 800, description: "Concrete steps, in plain language" },
      expected_effect: { type: "string", maxLength: 300, description: "What should improve, using only numbers the audit supports" },
    } },
    summarize: (a) => `Fix: ${a.title} (${a.priority} priority)`,
  },
  {
    name: "request_content_support",
    engine: "seo",
    description: "Ask the Social side to create content that supports an SEO goal, such as posts that link to a thin service page. Leaves an open request that the Social steward and the admin queue can see.",
    sideEffect: "internal",
    inputSchema: { type: "object", required: ["topic", "why"], properties: {
      topic: { type: "string", maxLength: 200 },
      page_url: { type: "string", maxLength: 300, description: "Page the content should support" },
      why: { type: "string", maxLength: 300 },
    } },
    summarize: (a) => `Ask Social for content on: ${a.topic}`,
    execute: async ({ supabase, clientId }, a) => {
      const { error } = await supabase.from("agent_requests").insert({
        client_account_id: clientId, from_engine: "seo", to_engine: "social", kind: "content_support",
        payload: { topic: a.topic, page_url: a.page_url ?? null, why: a.why },
      });
      if (error) throw new Error(error.message);
      return { requested: "social" };
    },
  },
];

export const ACTIONS: ActionDef[] = [...SEO_ACTIONS];

export function findAction(name: string): ActionDef | undefined {
  return ACTIONS.find((a) => a.name === name);
}
export function actionsFor(engine: Engine): ActionDef[] {
  return ACTIONS.filter((a) => a.engine === engine);
}
