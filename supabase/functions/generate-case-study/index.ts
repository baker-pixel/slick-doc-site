import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions, jsonResponse, errorResponse } from "../_shared/http.ts";
import { callAIJson, AIError } from "../_shared/ai.ts";
import { checkAdminAuth } from "../_shared/auth.ts";

interface RequestBody {
  clientAccountId: string;
  password?: string;
}

interface CaseStudyOutline {
  title: string;
  challenge: string;
  solution: string;
  metrics: { label: string; before: string; after: string; improvement: string }[];
}

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { clientAccountId, password } = (await req.json()) as RequestBody;
    if (!clientAccountId) throw new Error("clientAccountId is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const auth = await checkAdminAuth(req, supabase, password);
    if (!auth.authorized) return errorResponse("Unauthorized", 401);

    const { data: client, error: clientErr } = await supabase
      .from("client_accounts")
      .select("business_name, industry, website_summary, context_profile")
      .eq("id", clientAccountId)
      .single();
    if (clientErr || !client) throw new Error("Client not found");

    const ctx = client.context_profile as Record<string, unknown> | null;
    const services = Array.isArray(ctx?.services) ? (ctx!.services as string[]).join(", ") : null;
    const differentiators = Array.isArray(ctx?.differentiators) ? (ctx!.differentiators as string[]).join("; ") : null;

    const prompt = `Client: ${client.business_name}
Industry: ${client.industry || "unknown"}
${client.website_summary ? `Business summary: ${client.website_summary}` : ""}
${services ? `Services: ${services}` : ""}
${differentiators ? `Differentiators: ${differentiators}` : ""}

Draft a case study OUTLINE for this client. This is a starting point for a human to edit with real numbers and quotes
once they're available — use realistic, industry-appropriate PLACEHOLDER metrics, not invented specific claims.

Return JSON exactly in this shape:
{
  "title": "a compelling, specific title (not generic)",
  "challenge": "2-3 sentences on the problem this type of client typically faces",
  "solution": "2-3 sentences on how an agency like ours would address it",
  "metrics": [
    { "label": "metric name", "before": "placeholder", "after": "placeholder", "improvement": "e.g. +150%" }
  ]
}
Include 3-4 metrics relevant to ${client.industry || "this business"}.`;

    let outline: CaseStudyOutline;
    try {
      outline = await callAIJson<CaseStudyOutline>({
        source: "generate-case-study",
        system: "You are a marketing agency copywriter drafting a case study outline. Return valid JSON only.",
        prompt,
        maxTokens: 1000,
        temperature: 0.6,
      });
    } catch (e) {
      if (e instanceof AIError && (e.status === 429 || e.status === 402)) {
        return errorResponse(e.message, e.status);
      }
      throw e;
    }

    return jsonResponse({ outline });
  } catch (err) {
    console.error("generate-case-study error:", err);
    return errorResponse(err);
  }
});
