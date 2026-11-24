import { callAIJson, MODELS } from "../ai/ai.ts";
import type { ClientICP } from "./icp.ts";

export const MAX_PERSONA_TITLES = 6;
const MIN_TITLE_LEN = 2;
const MAX_TITLE_LEN = 50;

export interface WithPersonaTitles {
  buyer_persona?: string;
  persona_titles?: string[];
  /** The persona text persona_titles was derived from. A mismatch means the cache is stale. */
  persona_titles_for?: string;
}

const personaKey = (s: string | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** Trim, drop too-short/too-long entries, de-duplicate ignoring case, cap the count. */
export function normalizeTitles(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const t = raw.trim().replace(/\s+/g, " ");
    if (t.length < MIN_TITLE_LEN || t.length > MAX_TITLE_LEN) continue;
    if (seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out.slice(0, MAX_PERSONA_TITLES);
}

/** Cached titles if they still match the current persona; otherwise null (needs deriving). */
export function cachedPersonaTitles(icp: WithPersonaTitles | null | undefined): string[] | null {
  if (!icp || !personaKey(icp.buyer_persona)) return null;
  const titles = normalizeTitles(icp.persona_titles);
  if (titles.length === 0) return null;
  return personaKey(icp.persona_titles_for) === personaKey(icp.buyer_persona) ? titles : null;
}

/**
 * Titles to search Apollo people with, or [] when there is no persona or deriving failed
 * (callers then use the seniority ladder). Never throws.
 */
export async function ensurePersonaTitles(
  supabase: any,
  client: { id: string; business_name: string },
  icp: ClientICP & WithPersonaTitles,
): Promise<string[]> {
  const persona = (icp.buyer_persona ?? "").trim();
  if (!persona) return [];
  const cached = cachedPersonaTitles(icp);
  if (cached) return cached;
  try {
    const res = await callAIJson<{ titles?: unknown }>({
      source: "icp-persona-titles",
      clientId: client.id,
      model: MODELS.fast,
      jsonMode: true,
      maxTokens: 150,
      promptId: "icp-persona-titles.v1",
      prompt: `A company ("${client.business_name}") describes the person who buys from them as: "${persona}".
Customer type: ${icp.summary}
Give 3-6 job titles, as they appear on LinkedIn/in a company database, for that buyer. Include the common variants ("Head of People", "VP People", "Chief People Officer"), most likely buyer first.
Rules: titles only, no seniority words alone ("Manager"), no departments alone, no company names, max 5 words each.
Return ONLY JSON: {"titles":["..."]}`,
    });
    const titles = normalizeTitles(res.titles);
    if (titles.length > 0) {
      await supabase.from("client_accounts")
        .update({ icp: { ...icp, persona_titles: titles, persona_titles_for: persona } })
        .eq("id", client.id);
    }
    return titles;
  } catch (e) {
    console.error(`Persona titles failed for client ${client.id}:`, e instanceof Error ? e.message : e);
    return [];
  }
}
