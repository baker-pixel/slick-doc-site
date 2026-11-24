import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { handleOptions, jsonResponse } from "../_shared/core/http.ts";
import { serviceClient } from "../_shared/core/supabase.ts";
import { checkClientOrAdminAuth } from "../_shared/core/auth.ts";
import { callAIJson, MODELS } from "../_shared/ai/ai.ts";
import { cleanDraftedFacts, validDescription } from "../_shared/client/draftFacts.ts";

// "Tell us what you do" -> short fact statements for the Company Context card's Verified Facts.
// Nothing is saved here: the owner reviews the drafts and saves them with the rest of the card.
// For businesses whose website says little, so there is nothing to extract (see build-company-profile).
serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const supabase = serviceClient();
  try {
    const body = await req.json().catch(() => ({}));
    const clientId: string | undefined = body.client_id ?? body.clientId;
    if (!clientId) return jsonResponse({ error: "client_id is required" }, 400);

    const auth = await checkClientOrAdminAuth(req, supabase, clientId, body.password);
    if (!auth.authorized) return jsonResponse({ error: "Unauthorized" }, 401);

    if (!validDescription(body.description)) {
      return jsonResponse({ error: "Write a few sentences about what your business does (30 to 2000 characters)." }, 400);
    }
    const description: string = body.description.trim();

    const { data: client } = await supabase.from("client_accounts").select("business_name").eq("id", clientId).maybeSingle();
    if (!client) return jsonResponse({ error: "Client not found" }, 404);

    const raw = await callAIJson<{ facts?: unknown }>({
      source: "draft-verified-facts",
      clientId,
      model: MODELS.fast,
      jsonMode: true,
      maxTokens: 500,
      temperature: 0.2,
      promptId: "draft-verified-facts.v1",
      prompt: `The owner of "${client.business_name}" described their business in their own words:
"""
${description}
"""
Turn it into 3 to 6 short factual statements about the business, one idea each, plain wording, third person ("Builds websites for restaurants").
Rules: use ONLY what the owner wrote. Add no numbers, results, customers, awards or services they did not state. No marketing language, no exclamation marks. Each statement under 140 characters.
Return ONLY JSON: {"facts":["..."]}`,
    });

    const facts = cleanDraftedFacts(raw.facts, description);
    if (facts.length === 0) {
      return jsonResponse({ facts: [], message: "We couldn't turn that into clear facts. Try a few plain sentences about what you offer and who you help." });
    }
    return jsonResponse({ facts });
  } catch (e) {
    console.error("draft-verified-facts error:", e instanceof Error ? e.message : e);
    return jsonResponse({ error: "Could not draft facts right now. Please try again." }, 500);
  }
});
