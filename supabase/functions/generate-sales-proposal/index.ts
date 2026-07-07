import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleOptions, jsonResponse, errorResponse } from "../_shared/http.ts";
import { callAIJson, AIError } from "../_shared/ai.ts";

interface RequestBody {
  businessName: string;
  industry: string;
  prospectName?: string;
}

interface ProposalDraft {
  industry_analysis: {
    market_size?: string;
    competitors?: string[];
    opportunities?: string[];
    challenges?: string[];
  };
  proposed_services: { name: string; description: string; price: number }[];
  roi_projections: {
    monthly_leads?: number;
    conversion_rate?: number;
    avg_deal_value?: number;
    projected_revenue?: number;
    roi_percentage?: number;
  };
  timeline: { phase: string; duration: string; deliverables: string[] }[];
  pricing_breakdown: { item: string; price: number; frequency: "one-time" | "monthly" | "yearly" }[];
}

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { businessName, industry, prospectName } = (await req.json()) as RequestBody;
    if (!businessName?.trim()) throw new Error("businessName is required");
    if (!industry?.trim()) throw new Error("industry is required");

    const prompt = `Draft a sales proposal for a digital marketing agency (Orange Door Marketing) pitching
${businessName}, a ${industry} business${prospectName ? ` (contact: ${prospectName})` : ""}.

Use realistic, industry-appropriate figures — plausible estimates for this industry and business size, not
inflated claims. This is a starting draft a salesperson will review and adjust before sending.

Return JSON exactly in this shape:
{
  "industry_analysis": {
    "market_size": "one sentence on the local market opportunity",
    "competitors": ["2-3 typical competitor types, not real names"],
    "opportunities": ["2-3 realistic growth opportunities"],
    "challenges": ["2-3 realistic challenges this type of business faces"]
  },
  "proposed_services": [
    { "name": "service name", "description": "1 sentence", "price": 500 }
  ],
  "roi_projections": {
    "monthly_leads": 20,
    "conversion_rate": 15,
    "avg_deal_value": 800,
    "projected_revenue": 2400,
    "roi_percentage": 180
  },
  "timeline": [
    { "phase": "phase name", "duration": "e.g. Weeks 1-2", "deliverables": ["deliverable 1", "deliverable 2"] }
  ],
  "pricing_breakdown": [
    { "item": "item name", "price": 500, "frequency": "monthly" }
  ]
}
Include 3-4 proposed_services, 3 timeline phases, and 3-5 pricing_breakdown items.`;

    let proposal: ProposalDraft;
    try {
      proposal = await callAIJson<ProposalDraft>({
        source: "generate-sales-proposal",
        system: "You are a marketing agency sales strategist drafting a custom proposal. Return valid JSON only.",
        prompt,
        maxTokens: 1500,
        temperature: 0.6,
      });
    } catch (e) {
      if (e instanceof AIError && (e.status === 429 || e.status === 402)) {
        return errorResponse(e.message, e.status);
      }
      throw e;
    }

    return jsonResponse({ proposal });
  } catch (err) {
    console.error("generate-sales-proposal error:", err);
    return errorResponse(err);
  }
});
