// Shared LLM client. Single place for model names, retry/backoff,
// structured-output handling, and usage logging.

import { serviceClient } from "./supabase.ts";

export const MODELS = {
  /** Default reasoning/content model. */
  default: "llama-3.3-70b-versatile",
  /** Cheap/fast model for classification and low-stakes calls. */
  fast: "llama-3.1-8b-instant",
  /**
   * Higher-quality writing/reasoning model for client-facing creative work.
   * Falls back to `default` automatically if ANTHROPIC_API_KEY isn't set —
   * safe to reference everywhere even before the key is configured.
   */
  quality: "claude-sonnet-5",
} as const;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

function isAnthropicModel(model: string): boolean {
  return model.startsWith("claude-");
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AICallOptions {
  /** System prompt. Ignored if `messages` is provided. */
  system?: string;
  /** User prompt. Ignored if `messages` is provided. */
  prompt?: string;
  /** Full message list; overrides system/prompt. */
  messages?: ChatMessage[];
  model?: string;
  /** Tried in order if the primary model exhausts its retries on a retryable error. */
  fallbackModels?: string[];
  maxTokens?: number;
  temperature?: number;
  /** Request Groq JSON mode (response_format json_object). */
  jsonMode?: boolean;
  /** Retries per model on retryable errors (429/5xx/network). Default 2. */
  retries?: number;
  /** Caller name for usage logs and error messages. */
  source?: string;
  /** Client this call is on behalf of, for cost/quality attribution in agent_runs. */
  clientId?: string;
  /**
   * Stable identifier + version for the prompt template used, e.g.
   * "content-draft.v1". Lets agent_runs correlate a specific prompt
   * version with output quality / rejection rate over time. Optional —
   * omit for one-off/ad-hoc calls that don't need tracking.
   */
  promptId?: string;
}

let logClient: ReturnType<typeof serviceClient> | null | undefined;

function getLogClient() {
  if (logClient === undefined) {
    try {
      logClient = serviceClient();
    } catch {
      logClient = null;
    }
  }
  return logClient;
}

interface RunLogEntry {
  source: string;
  clientId?: string;
  promptId?: string;
  model: string;
  status: "ok" | "error";
  attemptCount: number;
  fallbackUsed: boolean;
  latencyMs: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  errorMessage?: string;
}

/** Best-effort observability write. Never throws — logging must not affect the caller. */
function logRun(entry: RunLogEntry): void {
  const client = getLogClient();
  if (!client) return;
  client
    .from("agent_runs")
    .insert({
      source: entry.source,
      client_id: entry.clientId ?? null,
      prompt_id: entry.promptId ?? null,
      model: entry.model,
      status: entry.status,
      attempt_count: entry.attemptCount,
      fallback_used: entry.fallbackUsed,
      latency_ms: entry.latencyMs,
      prompt_tokens: entry.promptTokens ?? null,
      completion_tokens: entry.completionTokens ?? null,
      error_message: entry.errorMessage ?? null,
    })
    .then(({ error }: { error: unknown }) => {
      if (error) console.error("[ai] agent_runs insert failed:", error);
    });
}

export class AIError extends Error {
  status: number | null;
  retryable: boolean;
  constructor(message: string, status: number | null, retryable: boolean) {
    super(message);
    this.name = "AIError";
    this.status = status;
    this.retryable = retryable;
  }
}

function buildMessages(opts: AICallOptions): ChatMessage[] {
  if (opts.messages && opts.messages.length > 0) return opts.messages;
  const msgs: ChatMessage[] = [];
  if (opts.system) msgs.push({ role: "system", content: opts.system });
  msgs.push({ role: "user", content: opts.prompt ?? "" });
  return msgs;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function withJsonHint(messages: ChatMessage[], jsonMode?: boolean): ChatMessage[] {
  // Groq (and good practice generally) rejects/ignores json mode unless
  // "json" appears somewhere in the conversation.
  if (!jsonMode || messages.some((m) => /json/i.test(m.content))) return messages;
  const finalMessages = [...messages];
  const last = finalMessages[finalMessages.length - 1];
  finalMessages[finalMessages.length - 1] = {
    ...last,
    content: `${last.content}\n\nRespond with valid JSON only.`,
  };
  return finalMessages;
}

/** Best-effort extraction of the actual provider-reported reason, so a bare
 * status code doesn't end up being the only thing anyone downstream (agent
 * traces, alerts, logs) ever sees for a failed call. */
function extractProviderErrorMessage(bodyText: string): string | null {
  try {
    const parsed = JSON.parse(bodyText);
    const msg = parsed?.error?.message ?? parsed?.message;
    return typeof msg === "string" ? msg.slice(0, 300) : null;
  } catch {
    return null;
  }
}

function throwForStatus(res: Response, bodyText: string, source: string): never {
  const retryAfter = Number(res.headers.get("retry-after")) || null;
  if (res.status === 429) {
    const err = new AIError("Rate limit exceeded. Please try again later.", 429, true);
    (err as AIError & { retryAfter?: number | null }).retryAfter = retryAfter;
    throw err;
  }
  if (res.status === 402) {
    throw new AIError("AI credits exhausted. Please add funds.", 402, false);
  }
  if (res.status >= 500) {
    throw new AIError(`AI provider error: ${res.status}`, res.status, true);
  }
  console.error(`[ai] ${source} non-retryable error ${res.status}: ${bodyText.slice(0, 500)}`);
  const providerMessage = extractProviderErrorMessage(bodyText);
  throw new AIError(
    providerMessage ? `AI request rejected: ${providerMessage}` : `AI request rejected: ${res.status}`,
    res.status,
    false,
  );
}

async function attemptGroqOnce(
  model: string,
  messages: ChatMessage[],
  opts: AICallOptions,
): Promise<{ text: string; usage: Record<string, number> | null }> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) throw new AIError("GROQ_API_KEY is not configured", null, false);

  const finalMessages = withJsonHint(messages, opts.jsonMode);

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: finalMessages,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });
  } catch (e) {
    throw new AIError(`AI request failed (network): ${e instanceof Error ? e.message : e}`, null, true);
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throwForStatus(res, bodyText, opts.source ?? "unknown");
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new AIError("AI returned empty response", null, true);
  return { text, usage: data.usage ?? null };
}

async function attemptAnthropicOnce(
  model: string,
  messages: ChatMessage[],
  opts: AICallOptions,
): Promise<{ text: string; usage: Record<string, number> | null }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new AIError("ANTHROPIC_API_KEY is not configured", null, false);

  const finalMessages = withJsonHint(messages, opts.jsonMode);
  const systemMessages = finalMessages.filter((m) => m.role === "system").map((m) => m.content);
  const conversation = finalMessages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        ...(systemMessages.length ? { system: systemMessages.join("\n\n") } : {}),
        messages: conversation,
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      }),
    });
  } catch (e) {
    throw new AIError(`AI request failed (network): ${e instanceof Error ? e.message : e}`, null, true);
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throwForStatus(res, bodyText, opts.source ?? "unknown");
  }

  const data = await res.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new AIError("AI returned empty response", null, true);
  const usage = data.usage
    ? { prompt_tokens: data.usage.input_tokens, completion_tokens: data.usage.output_tokens }
    : null;
  return { text, usage };
}

function attemptOnce(
  model: string,
  messages: ChatMessage[],
  opts: AICallOptions,
): Promise<{ text: string; usage: Record<string, number> | null }> {
  return isAnthropicModel(model)
    ? attemptAnthropicOnce(model, messages, opts)
    : attemptGroqOnce(model, messages, opts);
}

// ── Tool calling ─────────────────────────────────────────────────────────────
// A second message/response shape alongside the plain-text ChatMessage API
// above, needed because a tool-calling turn has to carry structured
// assistant-requested-calls and tool-result payloads that plain text can't
// represent. Normalized here and translated to each provider's own format
// (OpenAI-style `tool_calls`/`tool` messages for Groq, `tool_use`/`tool_result`
// content blocks for Anthropic) at the request/response boundary, mirroring
// the plain-text attemptGroqOnce/attemptAnthropicOnce split above.

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON schema for the tool's input. */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type AgentMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { role: "assistant_tool_use"; content: string; toolCalls: ToolCall[] }
  | { role: "tool_result"; toolCallId: string; toolName: string; content: string; isError?: boolean };

export interface ToolCallResult {
  /** Any text the assistant produced alongside/instead of tool calls this turn. */
  text: string;
  /** Tool calls requested this turn; empty when the assistant gave a final answer. */
  toolCalls: ToolCall[];
  stopReason: "tool_use" | "end_turn";
  usage: Record<string, number> | null;
}

export interface AIToolCallOptions extends Omit<AICallOptions, "messages" | "jsonMode" | "prompt" | "system"> {
  messages: AgentMessage[];
  tools: ToolDefinition[];
  /**
   * "required" (default) forces the model to call one of the provided tools
   * every turn -- it cannot just reply with prose instead of acting. Use
   * "auto" only for genuinely optional tool use; for an agent loop, a model
   * that's allowed to skip tools can silently stop making progress while
   * looking like it finished normally. Callers that want a clean stop
   * condition under "required" need to give the model an explicit tool for
   * that (e.g. a "finish" tool) rather than relying on plain-text replies.
   */
  toolChoice?: "auto" | "required";
}

function safeParseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function toGroqToolMessages(messages: AgentMessage[]): Record<string, unknown>[] {
  return messages.map((m) => {
    switch (m.role) {
      case "assistant_tool_use":
        return {
          role: "assistant",
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: JSON.stringify(tc.input) },
          })),
        };
      case "tool_result":
        return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
      default:
        return { role: m.role, content: m.content };
    }
  });
}

function toGroqTools(tools: ToolDefinition[]): Record<string, unknown>[] {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

async function attemptGroqToolsOnce(
  model: string,
  messages: AgentMessage[],
  tools: ToolDefinition[],
  opts: AIToolCallOptions,
): Promise<ToolCallResult> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) throw new AIError("GROQ_API_KEY is not configured", null, false);

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: toGroqToolMessages(messages),
        tools: toGroqTools(tools),
        tool_choice: opts.toolChoice ?? "required",
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      }),
    });
  } catch (e) {
    throw new AIError(`AI request failed (network): ${e instanceof Error ? e.message : e}`, null, true);
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throwForStatus(res, bodyText, opts.source ?? "unknown");
  }

  const data = await res.json();
  const message = data.choices?.[0]?.message;
  if (!message) throw new AIError("AI returned empty response", null, true);

  const rawToolCalls = message.tool_calls as
    | { id: string; function: { name: string; arguments: string } }[]
    | undefined;
  const toolCalls: ToolCall[] = (rawToolCalls ?? []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    input: safeParseJsonObject(tc.function.arguments),
  }));

  return {
    text: message.content ?? "",
    toolCalls,
    stopReason: toolCalls.length > 0 ? "tool_use" : "end_turn",
    usage: data.usage ?? null,
  };
}

function toAnthropicToolMessages(messages: AgentMessage[]): { system: string[]; conversation: Record<string, unknown>[] } {
  const system: string[] = [];
  const conversation: Record<string, unknown>[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      system.push(m.content);
    } else if (m.role === "user") {
      conversation.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      conversation.push({ role: "assistant", content: m.content });
    } else if (m.role === "assistant_tool_use") {
      const content: Record<string, unknown>[] = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls) content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
      conversation.push({ role: "assistant", content });
    } else if (m.role === "tool_result") {
      conversation.push({
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: m.toolCallId,
          content: m.content,
          ...(m.isError ? { is_error: true } : {}),
        }],
      });
    }
  }
  return { system, conversation };
}

function toAnthropicTools(tools: ToolDefinition[]): Record<string, unknown>[] {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
}

async function attemptAnthropicToolsOnce(
  model: string,
  messages: AgentMessage[],
  tools: ToolDefinition[],
  opts: AIToolCallOptions,
): Promise<ToolCallResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new AIError("ANTHROPIC_API_KEY is not configured", null, false);

  const { system, conversation } = toAnthropicToolMessages(messages);

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        ...(system.length ? { system: system.join("\n\n") } : {}),
        messages: conversation,
        tools: toAnthropicTools(tools),
        tool_choice: (opts.toolChoice ?? "required") === "required" ? { type: "any" } : { type: "auto" },
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      }),
    });
  } catch (e) {
    throw new AIError(`AI request failed (network): ${e instanceof Error ? e.message : e}`, null, true);
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throwForStatus(res, bodyText, opts.source ?? "unknown");
  }

  const data = await res.json();
  const blocks = (data.content ?? []) as { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }[];
  const text = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
  const toolCalls: ToolCall[] = blocks
    .filter((b) => b.type === "tool_use")
    .map((b) => ({ id: b.id!, name: b.name!, input: b.input ?? {} }));

  const usage = data.usage
    ? { prompt_tokens: data.usage.input_tokens, completion_tokens: data.usage.output_tokens }
    : null;

  return {
    text,
    toolCalls,
    stopReason: data.stop_reason === "tool_use" ? "tool_use" : "end_turn",
    usage,
  };
}

function attemptToolsOnce(
  model: string,
  messages: AgentMessage[],
  tools: ToolDefinition[],
  opts: AIToolCallOptions,
): Promise<ToolCallResult> {
  return isAnthropicModel(model)
    ? attemptAnthropicToolsOnce(model, messages, tools, opts)
    : attemptGroqToolsOnce(model, messages, tools, opts);
}

/**
 * Tool-calling counterpart to callAI: same retry/fallback/logging behavior,
 * but the model can request tool calls instead of (or alongside) returning
 * text. Callers loop -- append the assistant's tool_calls, run them, append
 * `tool_result` messages, and call this again -- until stopReason is
 * "end_turn". See supabase/functions/run-agent for the loop.
 */
export async function callAIWithTools(opts: AIToolCallOptions): Promise<ToolCallResult> {
  const retries = opts.retries ?? 2;
  const models = [opts.model ?? MODELS.default, ...(opts.fallbackModels ?? [])];
  const source = opts.source ?? "unknown";
  const callStarted = Date.now();

  let lastError: unknown = null;
  let totalAttempts = 0;

  for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
    const model = models[modelIndex];
    const isLastModel = modelIndex === models.length - 1;

    for (let attempt = 0; attempt <= retries; attempt++) {
      totalAttempts++;
      const started = Date.now();
      try {
        const result = await attemptToolsOnce(model, opts.messages, opts.tools, opts);
        const fallbackUsed = model !== models[0];
        console.log(
          `[ai-tools] ok source=${source} model=${model} ms=${Date.now() - started} toolCalls=${result.toolCalls.length}`,
        );
        logRun({
          source,
          clientId: opts.clientId,
          promptId: opts.promptId,
          model,
          status: "ok",
          attemptCount: totalAttempts,
          fallbackUsed,
          latencyMs: Date.now() - callStarted,
          promptTokens: result.usage?.prompt_tokens,
          completionTokens: result.usage?.completion_tokens,
        });
        return result;
      } catch (e) {
        lastError = e;
        const retryable = e instanceof AIError ? e.retryable : true;
        console.error(
          `[ai-tools] fail source=${source} model=${model} attempt=${attempt + 1}/${retries + 1} retryable=${retryable}:`,
          e instanceof Error ? e.message : e,
        );
        if (!retryable) {
          if (isLastModel) {
            logRun({
              source,
              clientId: opts.clientId,
              promptId: opts.promptId,
              model,
              status: "error",
              attemptCount: totalAttempts,
              fallbackUsed: model !== models[0],
              latencyMs: Date.now() - callStarted,
              errorMessage: e instanceof Error ? e.message : String(e),
            });
            throw e;
          }
          break;
        }
        if (attempt < retries) {
          const retryAfter = (e as { retryAfter?: number | null }).retryAfter;
          const backoffMs = retryAfter
            ? Math.min(retryAfter * 1000, 10_000)
            : Math.min(1000 * Math.pow(2.5, attempt), 8000);
          await sleep(backoffMs);
        }
      }
    }
  }

  const finalError = lastError instanceof Error
    ? lastError
    : new AIError("AI tool call failed after all retries and fallbacks", null, false);

  logRun({
    source,
    clientId: opts.clientId,
    promptId: opts.promptId,
    model: models[models.length - 1],
    status: "error",
    attemptCount: totalAttempts,
    fallbackUsed: models.length > 1,
    latencyMs: Date.now() - callStarted,
    errorMessage: finalError.message,
  });

  throw finalError;
}

/**
 * Call the LLM with retry + backoff and optional model fallback.
 * Returns the raw text of the completion.
 */
export async function callAI(opts: AICallOptions): Promise<string> {
  const messages = buildMessages(opts);
  const retries = opts.retries ?? 2;
  const models = [opts.model ?? MODELS.default, ...(opts.fallbackModels ?? [])];
  const source = opts.source ?? "unknown";
  const callStarted = Date.now();

  let lastError: unknown = null;
  let totalAttempts = 0;

  for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
    const model = models[modelIndex];
    const isLastModel = modelIndex === models.length - 1;

    for (let attempt = 0; attempt <= retries; attempt++) {
      totalAttempts++;
      const started = Date.now();
      try {
        const { text, usage } = await attemptOnce(model, messages, opts);
        const fallbackUsed = model !== models[0];
        console.log(
          `[ai] ok source=${source} model=${model} ms=${Date.now() - started}` +
            (usage ? ` prompt_tokens=${usage.prompt_tokens} completion_tokens=${usage.completion_tokens}` : ""),
        );
        if (fallbackUsed) {
          console.warn(`[ai] source=${source} served by fallback model ${model}`);
        }
        logRun({
          source,
          clientId: opts.clientId,
          promptId: opts.promptId,
          model,
          status: "ok",
          attemptCount: totalAttempts,
          fallbackUsed,
          latencyMs: Date.now() - callStarted,
          promptTokens: usage?.prompt_tokens,
          completionTokens: usage?.completion_tokens,
        });
        return text;
      } catch (e) {
        lastError = e;
        const retryable = e instanceof AIError ? e.retryable : true;
        console.error(
          `[ai] fail source=${source} model=${model} attempt=${attempt + 1}/${retries + 1} retryable=${retryable}:`,
          e instanceof Error ? e.message : e,
        );
        if (!retryable) {
          // A non-retryable error on this model (bad key, model unavailable,
          // 4xx) shouldn't abort the whole call if there's another model
          // left in the chain -- e.g. Claude tiering must cascade to the
          // Groq fallback when ANTHROPIC_API_KEY isn't configured yet.
          if (isLastModel) {
            logRun({
              source,
              clientId: opts.clientId,
              promptId: opts.promptId,
              model,
              status: "error",
              attemptCount: totalAttempts,
              fallbackUsed: model !== models[0],
              latencyMs: Date.now() - callStarted,
              errorMessage: e instanceof Error ? e.message : String(e),
            });
            throw e;
          }
          break;
        }
        if (attempt < retries) {
          const retryAfter = (e as { retryAfter?: number | null }).retryAfter;
          const backoffMs = retryAfter
            ? Math.min(retryAfter * 1000, 10_000)
            : Math.min(1000 * Math.pow(2.5, attempt), 8000);
          await sleep(backoffMs);
        }
      }
    }
  }

  const finalError = lastError instanceof Error
    ? lastError
    : new AIError("AI call failed after all retries and fallbacks", null, false);

  logRun({
    source,
    clientId: opts.clientId,
    promptId: opts.promptId,
    model: models[models.length - 1],
    status: "error",
    attemptCount: totalAttempts,
    fallbackUsed: models.length > 1,
    latencyMs: Date.now() - callStarted,
    errorMessage: finalError.message,
  });

  throw finalError;
}

/**
 * Extract a JSON value from LLM output: direct parse, then fenced block,
 * then first-to-last brace/bracket slice. Throws on failure.
 */
export function extractJson<T = unknown>(raw: string): T {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch { /* fall through */ }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim()) as T;
    } catch { /* fall through */ }
  }

  for (const [open, close] of [["{", "}"], ["[", "]"]] as const) {
    const start = trimmed.indexOf(open);
    const end = trimmed.lastIndexOf(close);
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as T;
      } catch { /* fall through */ }
    }
  }

  throw new Error(`Failed to parse JSON from AI output: ${trimmed.slice(0, 300)}`);
}

/**
 * Call the LLM expecting a JSON object back. Uses provider JSON mode,
 * tolerant extraction, and one automatic repair round-trip before failing.
 */
export async function callAIJson<T = unknown>(opts: AICallOptions): Promise<T> {
  const raw = await callAI({ ...opts, jsonMode: true });
  try {
    return extractJson<T>(raw);
  } catch (parseErr) {
    console.warn(`[ai] source=${opts.source ?? "unknown"} JSON parse failed, attempting repair`);
    const repairMessages: ChatMessage[] = [
      ...buildMessages(opts),
      { role: "assistant", content: raw },
      {
        role: "user",
        content:
          `Your previous reply was not valid JSON (${parseErr instanceof Error ? parseErr.message.slice(0, 200) : "parse error"}). ` +
          `Re-send ONLY the valid JSON, no prose, no markdown fences.`,
      },
    ];
    const repaired = await callAI({ ...opts, messages: repairMessages, jsonMode: true });
    return extractJson<T>(repaired);
  }
}
