// Client ICP (ideal customer profile) generation + prospect fit scoring.
// Shared by prospect-icp (admin-facing suggest/check) and
// backfill-prospect-context (scores enriched prospects in the background).

import { callAIJson, MODELS } from "./ai.ts";

export interface ClientICP {
  industries: string[];
  company_size?: string;
  geography: string;
  /** true → prospects are local physical businesses, Google Maps discovery is suitable */
  local: boolean;
  buyer_persona?: string;
  disqualifiers?: string[];
  summary: string;
}

export function hasValidICP(icp: unknown): icp is ClientICP {
  return !!icp && typeof icp === "object" && typeof (icp as ClientICP).summary === "string" &&
    Array.isArray((icp as ClientICP).industries);
}

/**
 * Returns the client's structured ICP, generating and persisting one from
 * its context_profile the first time. Returns null only if generation fails.
 */
export async function ensureClientICP(
  supabase: any,
  client: {
    id: string;
    business_name: string;
    industry?: string | null;
    icp?: unknown;
    context_profile?: Record<string, unknown> | null;
  },
): Promise<ClientICP | null> {
  if (hasValidICP(client.icp)) return client.icp;

  const ctx = client.context_profile || {};
  const prompt = `A marketing agency runs outbound prospecting on behalf of this client. Derive the client's ideal customer profile (ICP) -- who the CLIENT sells to, i.e. who we should prospect FOR them.

CLIENT:
- Business name: ${client.business_name}
- Industry: ${client.industry || "unknown"}
- Services: ${Array.isArray(ctx.services) ? (ctx.services as string[]).join(", ") : "unknown"}
- Target audience: ${typeof ctx.target_audience === "string" ? ctx.target_audience : "unknown"}
- Business summary: ${typeof ctx.business_summary === "string" ? ctx.business_summary : "n/a"}
- Location: ${typeof ctx.location === "string" ? ctx.location : "unknown"}

Return ONLY valid JSON:
{
  "industries": ["2-5 industries/business types their ideal customers are in"],
  "company_size": "e.g. '10-200 employees' or 'any'",
  "geography": "where their customers are, e.g. 'Knoxville, TN metro' or 'Global'",
  "local": true if their customers are local physical businesses reachable via Google Maps search, false if national/global/online B2B,
  "buyer_persona": "who at the customer makes the buying decision",
  "disqualifiers": ["1-3 traits that make a business a BAD fit"],
  "summary": "one sentence: their ideal customer"
}`;

  try {
    const icp = await callAIJson<ClientICP>({
      source: "ensure-client-icp",
      clientId: client.id,
      prompt,
      maxTokens: 500,
      jsonMode: true,
      model: MODELS.default,
      promptId: "client-icp.v1",
    });
    if (!hasValidICP(icp)) return null;

    await supabase.from("client_accounts").update({ icp }).eq("id", client.id);
    return icp;
  } catch (e) {
    console.error(`ICP generation failed for client ${client.id}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

export interface FitResult {
  score: number;
  reason: string;
}

/**
 * Scores a single prospect 0-100 against the client's ICP with a one-line
 * reason. Uses the fast model -- this runs for every discovered prospect.
 */
export interface ConversionWin { name: string; business_type: string | null; summary: string | null }

export async function scoreProspectFit(
  prospect: {
    id: string;
    name: string;
    business_type?: string | null;
    city?: string | null;
    website_url?: string | null;
    context_profile?: Record<string, unknown> | null;
  },
  icp: ClientICP,
  clientId?: string,
  wins: ConversionWin[] = [],
): Promise<FitResult | null> {
  const ctx = prospect.context_profile || {};

  // Feedback loop: real conversions calibrate the scorer. Prospects that
  // resemble businesses that actually became customers score higher than the
  // static ICP alone would suggest.
  const winsBlock = wins.length
    ? `\nPROSPECTS THAT ACTUALLY CONVERTED for this client (weight fit toward resembling these):\n${wins.map((w) => `- ${w.business_type || "business"}${w.summary ? `: ${w.summary}` : ""}`).join("\n")}`
    : "";

  const prompt = `Score how well this prospect matches the ideal customer profile, 0-100.

IDEAL CUSTOMER PROFILE:
- Summary: ${icp.summary}
- Industries: ${icp.industries.join(", ")}
- Company size: ${icp.company_size || "any"}
- Geography: ${icp.geography}
- Disqualifiers: ${(icp.disqualifiers || []).join("; ") || "none"}${winsBlock}

PROSPECT:
- Name: ${prospect.name}
- Business type: ${prospect.business_type || "unknown"}
- City: ${prospect.city || "unknown"}
- Services: ${Array.isArray(ctx.services) ? (ctx.services as string[]).join(", ") : "unknown"}
- Summary: ${typeof ctx.business_summary === "string" ? ctx.business_summary : "n/a"}
- Audience: ${typeof ctx.target_audience === "string" ? ctx.target_audience : "unknown"}

0-30 = wrong industry/geography or hits a disqualifier. 31-60 = partial match. 61-100 = solid to ideal fit${wins.length ? "; nudge up prospects that resemble the converted examples" : ""}.
Return ONLY valid JSON: { "score": <int 0-100>, "reason": "<one short sentence>" }`;

  try {
    const res = await callAIJson<FitResult>({
      source: "score-prospect-fit",
      clientId,
      prompt,
      maxTokens: 150,
      jsonMode: true,
      model: MODELS.fast,
      promptId: "prospect-fit.v1",
    });
    if (typeof res?.score !== "number") return null;
    return { score: Math.max(0, Math.min(100, Math.round(res.score))), reason: res.reason || "" };
  } catch (e) {
    console.error(`Fit scoring failed for prospect ${prospect.id}:`, e instanceof Error ? e.message : e);
    return null;
  }
}
