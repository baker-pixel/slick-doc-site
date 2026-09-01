// Shared LLM client. Single place for model names, retry/backoff,
// structured-output handling, and usage logging.

import { serviceClient } from "./supabase.ts";
import { functionErrorAlert } from "./alerts.ts";

export const MODELS = {
  /** Default reasoning/content model. */
  default: "openai/gpt-oss-120b",
  /** Cheap/fast model for classification and low-stakes calls. */
  fast: "openai/gpt-oss-20b",
} as const;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// gpt-oss models are reasoning models -- Groq defaults reasoning_effort to
// "medium", which burns max_tokens on hidden reasoning before any answer
// text is emitted. On tight budgets (short social copy: 120-700 tokens)
// that leaves message.content empty and the whole call fails with "AI
// returned empty response". Capped low here since these are short
// copywriting tasks, not multi-step reasoning problems.
function isGptOssModel(model: string): boolean {
  return model.startsWith("openai/gpt-oss-");
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
  /** Skip the admin automation_alerts write on final failure. Use for
   * callers that already catch and treat failure as non-fatal. */
  silent?: boolean;
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

/** Best-effort admin alert when an AI call exhausts every model/retry. Never throws. */
function alertOnFinalFailure(source: string, model: string, err: unknown): void {
  const client = getLogClient();
  if (!client) return;
  functionErrorAlert(client, `ai:${source}`, err, { model }).catch(() => {});
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
  /** True when the model hit max_tokens with no answer text yet -- e.g. a
   * reasoning model (gpt-oss) burning the whole budget on hidden reasoning.
   * callAI grows maxTokens on retry when this is set, since retrying at the
   * same budget would just reproduce the same truncation. */
  truncated: boolean;
  constructor(message: string, status: number | null, retryable: boolean, truncated = false) {
    super(message);
    this.name = "AIError";
    this.status = status;
    this.retryable = retryable;
    this.truncated = truncated;
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
  // Groq returns 400 json_validate_failed when the model emits malformed
  // JSON in jsonMode -- usually a sampling flake, retryable. But if it's the
  // SAME prompt failing this way across every retry and every fallback
  // model, that's not noise, it's something in the input consistently
  // breaking JSON-mode -- log the actual rejected output so that's
  // diagnosable instead of just "invalid JSON" with no detail.
  if (res.status === 400 && bodyText.includes("json_validate_failed")) {
    console.error(`[ai] ${source} json_validate_failed: ${bodyText.slice(0, 800)}`);
    let detail = "";
    try {
      const failedGen = JSON.parse(bodyText)?.error?.failed_generation;
      if (typeof failedGen === "string") detail = ` -- model output: ${failedGen.slice(0, 200)}`;
    } catch { /* no failed_generation field -- fall back to the generic message */ }
    throw new AIError(`Model produced invalid JSON${detail}`, 400, true);
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
        ...(isGptOssModel(model) ? { reasoning_effort: "low" } : {}),
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
  const choice = data.choices?.[0];
  const text = choice?.message?.content;
  if (!text) {
    // finish_reason "length" + no content = max_tokens was hit before any
    // answer text came out -- on a reasoning model that means the budget
    // went entirely to hidden reasoning. Retrying at the same maxTokens
    // would just reproduce it, so flag it for callAI to grow the budget.
    const truncated = choice?.finish_reason === "length";
    throw new AIError(
      truncated
        ? "AI returned empty response (reasoning consumed the token budget before any answer text)"
        : "AI returned empty response",
      null,
      true,
      truncated,
    );
  }
  return { text, usage: data.usage ?? null };
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
  // Grows only on a "truncated" failure (max_tokens hit with no answer text
  // yet, e.g. a reasoning model burning the budget on hidden reasoning) --
  // retrying at the original budget would just reproduce the same
  // truncation. Capped so a pathological prompt can't run away on cost.
  let currentMaxTokens = opts.maxTokens;
  const MAX_TOKENS_CEILING = 4000;

  for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
    const model = models[modelIndex];
    const isLastModel = modelIndex === models.length - 1;

    for (let attempt = 0; attempt <= retries; attempt++) {
      totalAttempts++;
      const started = Date.now();
      try {
        const { text, usage } = await attemptGroqOnce(model, messages, { ...opts, maxTokens: currentMaxTokens });
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
          // A non-retryable error on this model (model unavailable, 4xx)
          // shouldn't abort the whole call if there's another model left in
          // the fallback chain.
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
            if (!opts.silent) alertOnFinalFailure(source, model, e);
            throw e;
          }
          break;
        }
        if (e instanceof AIError && e.truncated && currentMaxTokens) {
          currentMaxTokens = Math.min(currentMaxTokens * 2, MAX_TOKENS_CEILING);
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
  if (!opts.silent) alertOnFinalFailure(source, models[models.length - 1], finalError);

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
