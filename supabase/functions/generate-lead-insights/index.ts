import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleOptions, jsonResponse, errorResponse } from "../_shared/http.ts";
import { callAIJson, MODELS } from "../_shared/ai.ts";

interface LeadInput {
  id: string;
  name: string;
  businessName: string;
  tier: "hot" | "warm" | "cold";
  overallScore: number;
  urgencyScore: number;
  budgetScore: number;
  intentScore: number;
  signals: string[];
}

interface RequestBody {
  leads: LeadInput[];
}

interface InsightsResponse {
  insights: { id: string; summary: string }[];
}

// Batched in one call rather than one request per lead -- cheaper, faster
// for a list of 20, and keeps this from becoming 20 round trips on every
// panel load or re-score click.
serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { leads } = (await req.json()) as RequestBody;
    if (!Array.isArray(leads) || leads.length === 0) {
      return jsonResponse({ insights: {} });
    }

    const leadList = leads
      .map((l) => {
        const signalsStr = l.signals.length > 0 ? l.signals.join("; ") : "no specific signals detected";
        return `- id=${l.id}: ${l.name} at ${l.businessName}. Tier: ${l.tier}. Scores — urgency ${l.urgencyScore}, budget ${l.budgetScore}, intent ${l.intentScore}, overall ${l.overallScore}. Detected: ${signalsStr}.`;
      })
      .join("\n");

    const prompt = `Here are scored sales leads for a marketing agency:
${leadList}

For each lead, write ONE honest sentence summarizing why they scored the way they did, based only on the
signals given — do not invent details not present above. If a lead has no real signals, say so plainly
rather than inventing enthusiasm.

Return JSON: { "insights": [{ "id": "the lead id", "summary": "one sentence" }] } for every lead listed.`;

    let result: InsightsResponse;
    try {
      result = await callAIJson<InsightsResponse>({
        source: "generate-lead-insights",
        model: MODELS.fast,
        system: "You are a sales analyst. Be factual and specific to the data given. Return valid JSON only.",
        prompt,
        maxTokens: 1500,
        temperature: 0.3,
        retries: 1,
      });
    } catch (e) {
      console.warn("[generate-lead-insights] AI call failed, returning no insights:", e instanceof Error ? e.message : e);
      return jsonResponse({ insights: {} });
    }

    const insightMap = Object.fromEntries(
      (result.insights ?? []).map((i) => [i.id, i.summary]),
    );

    return jsonResponse({ insights: insightMap });
  } catch (err) {
    console.error("generate-lead-insights error:", err);
    return errorResponse(err);
  }
});
