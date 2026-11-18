// Live LLM visibility probe -- distinct from ai_readiness_scores (a free,
// deterministic heuristic every report gets, see aiReadiness.ts). This
// actually asks ChatGPT and Claude a real category+location question and
// checks whether the client gets cited -- costs real API money per call,
// gated to paid tiers via tierPolicy().aiVisibility.

export interface ProbeResult {
  mentioned: boolean;
  position: number | null; // 1-indexed rank in a numbered list, when parseable
  excerpt: string;
}

/** Deterministic prompt templates -- kept small and fixed per the "keep it
 * minimal" budget decision, not a config surface. */
const TEMPLATES: ((industry: string, location: string) => string)[] = [
  (industry, location) => `What are the best ${industry} in ${location}? List the top 5 recommendations with business name and website, numbered 1 to 5.`,
  (industry, location) => `Who are the top-rated ${industry} near ${location}? Give a numbered list of 5 with business name and website.`,
  (industry, location) => `I'm looking for a reliable ${industry} in ${location} -- what are my best options? Number the top 5, with business name and website.`,
];

export function generateVisibilityPrompts(
  industry: string,
  location: string,
  services: string[],
  maxPrompts: number,
): string[] {
  const prompts: string[] = [];
  for (const template of TEMPLATES) {
    if (prompts.length >= maxPrompts) break;
    prompts.push(template(industry, location));
  }
  for (const service of services) {
    if (prompts.length >= maxPrompts) break;
    prompts.push(`Who are the best providers for ${service} in ${location}? List the top 5, numbered, with business name and website.`);
  }
  return prompts;
}

function parseNumberedList(text: string): string[] {
  const items: string[] = [];
  for (const m of text.matchAll(/^\s*\d+[.)]\s*(.+)$/gm)) {
    items.push(m[1].trim());
  }
  return items;
}

function findMention(
  items: string[],
  fullText: string,
  clientName: string,
  clientDomain?: string,
): { mentioned: boolean; position: number | null } {
  const nameLower = clientName.toLowerCase();
  const domainLower = clientDomain?.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();

  for (let i = 0; i < items.length; i++) {
    const itemLower = items[i].toLowerCase();
    if (itemLower.includes(nameLower) || (domainLower && domainLower.length > 0 && itemLower.includes(domainLower))) {
      return { mentioned: true, position: i + 1 };
    }
  }
  // No numbered-list hit -- the model may have answered in prose. A plain
  // substring match anywhere still counts as a mention, just with no
  // determinable position.
  const textLower = fullText.toLowerCase();
  if (textLower.includes(nameLower) || (domainLower && domainLower.length > 0 && textLower.includes(domainLower))) {
    return { mentioned: true, position: null };
  }
  return { mentioned: false, position: null };
}

const OPENAI_API = "https://api.openai.com/v1";

/** Reuses the same OpenAI Responses API + web_search tool pattern already
 * used by discover-prospects-web -- one integration, not two. gpt-5-mini is
 * OpenAI's default consumer chat model today, which is what this probe is
 * meant to reflect (not the priciest flagship). */
export async function probeOpenAI(
  openaiKey: string,
  prompt: string,
  clientName: string,
  clientDomain?: string,
): Promise<ProbeResult> {
  const models = ["gpt-5-mini", "gpt-4o-mini"];
  let text = "";

  for (const model of models) {
    try {
      const res = await fetch(`${OPENAI_API}/responses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, tools: [{ type: "web_search" }], input: prompt }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      text = (data.output ?? [])
        .filter((item: any) => item.type === "message")
        .flatMap((item: any) => item.content ?? [])
        .filter((c: any) => c.type === "output_text")
        .map((c: any) => c.text)
        .join("\n");
      if (text) break;
    } catch {
      continue;
    }
  }

  const items = parseNumberedList(text);
  const { mentioned, position } = findMention(items, text, clientName, clientDomain);
  return { mentioned, position, excerpt: text.slice(0, 500) };
}

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

/** Claude Haiku 4.5 -- deliberately the fast/cheap tier, not Opus. This probe
 * measures what a typical consumer sees from a default chat assistant, and
 * keeps a monthly per-client batch job affordable. */
export async function probeClaude(
  anthropicKey: string,
  prompt: string,
  clientName: string,
  clientDomain?: string,
): Promise<ProbeResult> {
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      tools: [{ type: "web_search_20260209", name: "web_search" }],
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude probe failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }

  const data = await res.json();
  const text = (data.content ?? [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");

  const items = parseNumberedList(text);
  const { mentioned, position } = findMention(items, text, clientName, clientDomain);
  return { mentioned, position, excerpt: text.slice(0, 500) };
}
