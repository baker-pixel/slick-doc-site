import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleOptions, jsonResponse, errorResponse } from "../_shared/http.ts";
import { callAI, AIError } from "../_shared/ai.ts";

interface RequestBody {
  reviewText: string;
  rating: number;
  authorName?: string;
  businessName: string;
}

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { reviewText, rating, authorName, businessName } = (await req.json()) as RequestBody;

    if (!reviewText?.trim()) throw new Error("reviewText is required");
    if (typeof rating !== "number" || rating < 1 || rating > 5) throw new Error("rating must be a number 1-5");
    if (!businessName?.trim()) throw new Error("businessName is required");

    const sentiment = rating >= 4 ? "positive" : rating === 3 ? "mixed" : "negative";

    const system =
      "You are a marketing agency writing a public reply to a Google review on behalf of a client business. " +
      "Match the tone to the review: warm and specific for positive reviews, empathetic and solution-focused for " +
      "negative ones. Never sound like a template — reference something specific from the review text. Keep it " +
      "under 80 words. Never make promises about refunds/compensation. Return ONLY the reply text, no quotes, no preamble.";

    const prompt = `Business: ${businessName}
Reviewer: ${authorName || "the reviewer"}
Rating: ${rating}/5 (${sentiment})
Review: "${reviewText}"

Write the public reply.`;

    const response = (await callAI({
      source: "generate-review-response",
      system,
      prompt,
      maxTokens: 250,
      temperature: 0.6,
    })).trim();

    return jsonResponse({ response });
  } catch (err) {
    if (err instanceof AIError && (err.status === 429 || err.status === 402)) {
      return errorResponse(err.message, err.status);
    }
    console.error("generate-review-response error:", err);
    return errorResponse(err);
  }
});
