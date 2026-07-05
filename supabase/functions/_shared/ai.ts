// Shared LLM client. Single place for model names, retry/backoff,
// structured-output handling, and usage logging.

import { serviceClient } from "./supabase.ts";

export const MODELS = {
  /** Default reasoning/content model. */
  default: "llama-3.3-70b-versatile",
  /** Cheap/fast model for classification and low-stakes calls. */
  fast: "llama-3.1-8b-instant",
} as const;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

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

async function attemptOnce(
  model: string,
  messages: ChatMessage[],
  opts: AICallOptions,
): Promise<{ text: string; usage: Record<string, number> | null }> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) throw new AIError("GROQ_API_KEY is not configured", null, false);

  // Groq rejects json_object mode unless "json" appears in the conversation.
  let finalMessages = messages;
  if (opts.jsonMode && !messages.some((m) => /json/i.test(m.content))) {
    finalMessages = [...messages];
    const last = finalMessages[finalMessages.length - 1];
    finalMessages[finalMessages.length - 1] = {
      ...last,
      content: `${last.content}\n\nRespond with valid JSON only.`,
    };
  }

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
    console.error(`[ai] ${opts.source ?? "unknown"} non-retryable error ${res.status}: ${bodyText.slice(0, 500)}`);
    throw new AIError(`AI request rejected: ${res.status}`, res.status, false);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new AIError("AI returned empty response", null, true);
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

  for (const model of models) {
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
          logRun({
            source,
            clientId: opts.clientId,
            model,
            status: "error",
            attemptCount: totalAttempts,
            fallbackUsed: model !== models[0],
            latencyMs: Date.now() - callStarted,
            errorMessage: e instanceof Error ? e.message : String(e),
          });
          throw e;
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
