// The agent loop: one reasoning agent that calls tools instead of a fixed
// per-jobType pipeline. Design decisions locked in during scoping (see
// project memory): wrap existing handlers as tools rather than give the
// agent raw DB access; let it act autonomously for low-risk (non-client-
// facing) steps and require admin approval only for tools that communicate
// with the client directly; enforce both a hard step/time limit AND a
// self-critique pass before finishing.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAIWithTools, callAI, MODELS, type AgentMessage, type ToolDefinition } from "../_shared/ai.ts";
import type { ClientData } from "../run-automation/types.ts";
import { AUTOMATION_TOOLS, toToolDefinitions, findTool } from "./tools.ts";

const MAX_STEPS = 8;
const MAX_TIME_MS = 100_000;

// Tool calling is forced (toolChoice: "required") rather than left to the
// model's discretion -- an agent that's allowed to just reply with prose
// instead of calling a tool can silently stop making progress while still
// looking like a normal completion. Forcing tool use means the model needs
// an explicit, valid way to signal "I'm done" that isn't plain text --
// this synthetic tool is that signal.
const FINISH_TOOL: ToolDefinition = {
  name: "finish",
  description: "Call this once you've made all the progress you reasonably can, or determined no action is needed. This ends the run -- it does not take any action itself.",
  parameters: {
    type: "object",
    properties: {
      summary: { type: "string", description: "What you did (or why nothing was needed) and why you're stopping now." },
    },
    required: ["summary"],
  },
};

export interface AgentStep {
  step: number;
  tool: string;
  input: Record<string, unknown>;
  status: "ok" | "error" | "pending_approval";
  output?: unknown;
  error?: string;
  ms: number;
}

export interface AgentTraceRow {
  id: string;
  client_id: string;
  goal: string;
  status: "running" | "completed" | "failed" | "stopped";
  stop_reason: "self_terminated" | "step_limit" | "time_limit" | "error" | null;
  steps: AgentStep[];
  step_count: number;
  final_summary: string | null;
  error_message: string | null;
}

function systemPrompt(client: ClientData): string {
  return `You are Orange Door Marketing's automation agent, working on behalf of the agency (not the client) to progress a specific client's account.

Client: ${client.business_name} (tier: ${client.tier}, industry: ${client.industry ?? "unknown"})

You have tools available, each representing one piece of agency automation work. Some tools email the client directly -- those are marked in their description and will NOT execute immediately when you call them. Instead they are queued for a human admin to approve; you'll receive a tool result telling you it was queued, not that it succeeded. Everything else executes immediately and produces an internal record or a "pending review" deliverable that a human reviews before anything reaches the client -- you do not need approval for those.

You must call a tool on every turn -- you cannot reply with plain text instead. Call tools to make real progress toward the goal. Don't call a tool that's clearly irrelevant to the goal. Don't repeat a tool call you've already made this run unless the goal specifically requires it more than once. When you've made all the progress you reasonably can (including if no action is needed at all), call the "finish" tool with a short summary of what you did and why you're stopping.`;
}

function toolResultContent(step: AgentStep): string {
  if (step.status === "pending_approval") {
    return `Queued for admin approval -- this action sends something directly to the client and will not run until approved. It has NOT executed.`;
  }
  if (step.status === "error") {
    return `Error: ${step.error}`;
  }
  return JSON.stringify(step.output ?? {}).slice(0, 4000);
}

async function runStep(
  supabase: SupabaseClient,
  client: ClientData,
  traceId: string,
  toolName: string,
  input: Record<string, unknown>,
  reasoning: string,
): Promise<AgentStep> {
  const started = Date.now();
  const tool = findTool(toolName);

  if (!tool) {
    return { step: 0, tool: toolName, input, status: "error", error: `Unknown tool: ${toolName}`, ms: Date.now() - started };
  }

  if (tool.requiresApproval) {
    const { error } = await supabase.from("agent_pending_actions").insert({
      trace_id: traceId,
      client_id: client.id,
      tool_name: toolName,
      tool_input: input,
      reasoning: reasoning || null,
    });
    if (error) console.error("[run-agent] failed to queue pending action:", error);
    return { step: 0, tool: toolName, input, status: "pending_approval", ms: Date.now() - started };
  }

  try {
    // Record the automation_jobs row the same way run-automation does, so
    // existing admin views over automation_jobs see agent-triggered work too.
    const { data: job } = await supabase
      .from("automation_jobs")
      .insert({
        client_id: client.id,
        job_type: toolName,
        status: "running",
        input_data: input,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    const output = await tool.run(supabase, client, input);

    if (job) {
      await supabase
        .from("automation_jobs")
        .update({ status: "completed", output_data: output, completed_at: new Date().toISOString() })
        .eq("id", job.id);
    }

    return { step: 0, tool: toolName, input, status: "ok", output, ms: Date.now() - started };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[run-agent] tool ${toolName} failed:`, message);
    return { step: 0, tool: toolName, input, status: "error", error: message, ms: Date.now() - started };
  }
}

async function selfCritique(client: ClientData, goal: string, steps: AgentStep[], finalText: string): Promise<string> {
  const stepsSummary = steps
    .map((s) => `- ${s.tool} (${s.status}): ${s.status === "error" ? s.error : s.status === "pending_approval" ? "queued for approval" : "completed"}`)
    .join("\n");

  try {
    return await callAI({
      source: "run-agent:self-critique",
      model: MODELS.fast,
      system: "You are reviewing an automation agent's own run for a marketing agency's internal QA log. Be honest and brief -- 2-4 sentences.",
      prompt: `Goal: ${goal}\nClient: ${client.business_name}\n\nSteps taken:\n${stepsSummary || "(none)"}\n\nAgent's own closing summary: ${finalText || "(none given)"}\n\nDid the agent make real progress toward the goal? Was anything it did questionable, redundant, or risky? Reply with a short honest assessment.`,
      maxTokens: 300,
    });
  } catch (e) {
    console.error("[run-agent] self-critique failed:", e);
    return finalText || "(self-critique unavailable)";
  }
}

export async function runAgentLoop(
  supabase: SupabaseClient,
  client: ClientData,
  goal: string,
  traceId: string,
): Promise<AgentTraceRow> {
  const startedAt = Date.now();
  const messages: AgentMessage[] = [
    { role: "system", content: systemPrompt(client) },
    { role: "user", content: goal },
  ];
  const tools = [...toToolDefinitions(AUTOMATION_TOOLS), FINISH_TOOL];
  const steps: AgentStep[] = [];
  let stopReason: AgentTraceRow["stop_reason"] = null;
  let finalText = "";

  for (let stepNum = 1; stepNum <= MAX_STEPS; stepNum++) {
    if (Date.now() - startedAt > MAX_TIME_MS) {
      stopReason = "time_limit";
      break;
    }

    let result;
    try {
      result = await callAIWithTools({
        source: "run-agent",
        clientId: client.id,
        model: MODELS.default,
        messages,
        tools,
        toolChoice: "required",
        maxTokens: 1024,
      });
    } catch (e) {
      stopReason = "error";
      finalText = `Agent reasoning call failed: ${e instanceof Error ? e.message : String(e)}`;
      break;
    }

    // Defensive fallback: tool_choice="required" should make this
    // unreachable, but a provider quirk returning no tool calls shouldn't
    // crash the run -- treat it the same as an explicit finish.
    if (result.toolCalls.length === 0) {
      finalText = result.text;
      stopReason = "self_terminated";
      break;
    }

    messages.push({ role: "assistant_tool_use", content: result.text, toolCalls: result.toolCalls });

    const finishCall = result.toolCalls.find((c) => c.name === "finish");
    const realCalls = result.toolCalls.filter((c) => c.name !== "finish");

    for (const call of realCalls) {
      const step = await runStep(supabase, client, traceId, call.name, call.input, result.text);
      step.step = steps.length + 1;
      steps.push(step);
      messages.push({
        role: "tool_result",
        toolCallId: call.id,
        toolName: call.name,
        content: toolResultContent(step),
        isError: step.status === "error",
      });
    }

    if (finishCall) {
      finalText = (finishCall.input.summary as string | undefined) ?? result.text;
      messages.push({ role: "tool_result", toolCallId: finishCall.id, toolName: "finish", content: "Run finished." });
      stopReason = "self_terminated";
      break;
    }

    if (steps.length >= MAX_STEPS) {
      stopReason = "step_limit";
      break;
    }
  }

  if (!stopReason) stopReason = "step_limit";

  const summary = await selfCritique(client, goal, steps, finalText);

  return {
    id: traceId,
    client_id: client.id,
    goal,
    status: stopReason === "error" ? "failed" : stopReason === "self_terminated" ? "completed" : "stopped",
    stop_reason: stopReason,
    steps,
    step_count: steps.length,
    final_summary: summary,
    error_message: stopReason === "error" ? finalText : null,
  };
}
