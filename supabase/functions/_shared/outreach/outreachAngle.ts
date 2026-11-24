// Derives the hook for a cold email (see outreachPrompt.ts "Outreach angle"): one true
// observation about the recipient and one honest question that follows from it. Runs once
// per lead; the result is cached on the lead so every step of the sequence uses the same angle.

import { callAIJson } from "../ai/ai.ts";
import { parseAngle, senderFactsBlock, type OutreachAngle, type SenderContext } from "./outreachPrompt.ts";

export interface AngleProspect {
  name: string;
  business_type?: string | null;
  city?: string | null;
  website_url?: string | null;
  context_profile?: Record<string, unknown> | null;
  top_weaknesses?: string[] | null;
  research_snapshot?: Record<string, unknown> | null;
}

const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** The recipient facts we actually hold, as labelled lines plus one flat string for grounding. */
export function recipientFacts(p: AngleProspect): { lines: string; flat: string } {
  const c = p.context_profile ?? {};
  const parts: [string, string][] = [
    ["Company", p.name],
    ["Type", text(c.industry) || (p.business_type ?? "")],
    ["Location", text(c.location) || (p.city ?? "")],
    ["Summary", text(c.business_summary)],
    ["Offers", list(c.services).join(", ")],
    ["Who they serve", text(c.target_audience)],
    ["Stands out for", list(c.differentiators).slice(0, 4).join("; ")],
    ["Known gaps", list(c.pain_points).slice(0, 2).join("; ") || (p.top_weaknesses ?? []).slice(0, 2).join("; ")],
  ];
  const kept = parts.filter(([, v]) => v);
  return { lines: kept.map(([k, v]) => `- ${k}: ${v}`).join("\n"), flat: kept.map(([, v]) => v).join(". ") };
}

/** Cached angles on the lead (also reads the single angle saved by the first version). */
export function cachedAngles(p: AngleProspect): OutreachAngle[] {
  const snap = p.research_snapshot ?? {};
  const raw = Array.isArray(snap.outreach_angles) ? snap.outreach_angles : snap.outreach_angle ? [snap.outreach_angle] : [];
  return raw
    .filter((a): a is { observation: string; question: string } =>
      !!a && typeof (a as { observation?: unknown }).observation === "string" && typeof (a as { question?: unknown }).question === "string")
    .map((a) => ({ observation: a.observation, question: a.question }))
    .slice(0, MAX_ANGLES);
}

export const MAX_ANGLES = 3;

/** Returns [] when there is too little about the recipient to say anything specific. Never throws. */
export async function deriveOutreachAngle(
  client: { id: string; business_name: string; context_profile?: SenderContext | null },
  prospect: AngleProspect,
): Promise<OutreachAngle[]> {
  const facts = recipientFacts(prospect);
  // A name and a type is not a hook.
  if (facts.lines.split("\n").length < 3) return [];
  try {
    const raw = await callAIJson<{ angles?: unknown }>({
      source: "run-prospect-drip",
      clientId: client.id,
      promptId: "prospect-outreach-angle.v2",
      jsonMode: true,
      maxTokens: 700,
      temperature: 0.4,
      prompt: `A sender is writing a cold email to a small business. Find the hook: one true thing about THEM, and one honest question.

SENDER:
${senderFactsBlock(client.context_profile, client.business_name)}

RECIPIENT (the only facts you may use):
${facts.lines}

Give up to ${MAX_ANGLES} angles for a sequence of emails. Each must look at a DIFFERENT side of their business (for example a different offer, location or audience), so the follow-ups do not repeat each other.
Return ONLY JSON: {"angles":[{"observation":"...","question":"..."}]}
Each angle:
- observation: ONE sentence saying something specific about what they do, using only RECIPIENT facts (their offers, places, audience). Add no number, award or judgement about quality. Written to them ("You ...").
- question: ONE question about a marketing or visibility challenge that follows naturally from that observation and that the sender's services could plausibly help with. Do not claim they have a problem. Not generic ("Are you looking to grow?").
If the facts are too thin to say anything specific, return {"angles":[]}.`,
    });
    const out: OutreachAngle[] = [];
    for (const a of Array.isArray(raw.angles) ? raw.angles : []) {
      const parsed = parseAngle(a, facts.flat);
      // Skip an angle that just repeats an earlier one's question.
      if (parsed && !out.some((o) => o.question.toLowerCase() === parsed.question.toLowerCase())) out.push(parsed);
      if (out.length >= MAX_ANGLES) break;
    }
    return out;
  } catch (e) {
    console.warn(`outreach angle failed for ${prospect.name}:`, e instanceof Error ? e.message : e);
    return [];
  }
}
