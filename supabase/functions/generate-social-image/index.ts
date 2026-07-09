import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkAdminAuth } from "../_shared/auth.ts";
import { generateGptImage, persistGeneratedImage } from "../_shared/gptImage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_COUNT = 4;

// Callers pass a fully-built prompt (usually from buildSocialImagePrompt,
// which already sets subject and style) -- only append the hard constraints,
// don't force a photography style or an aspect ratio the canvas already
// decides.
function buildFinalPrompt(prompt: string): string {
  return [
    prompt.trim(),
    `Clean negative space suitable for a text overlay.`,
    `No text overlays, no logos, no watermarks.`,
  ].join(" ");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const openaiKey = Deno.env.get("OPENAI_API_KEY");

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  try {
    const { prompt, platform = "instagram", count = 1, password } = await req.json();

    // Server-to-server callers (postforme-publish-post, generate-social-images-batch)
    // invoke this with the service role key and no admin session/password --
    // checkAdminAuth has no bypass for that, so it would 401 every such call.
    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const isServer = bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!isServer) {
      const auth = await checkAdminAuth(req, supabase, password);
      if (!auth.authorized) return json({ error: "Unauthorized" }, 401);
    }

    if (!openaiKey) {
      return json({ error: "OPENAI_API_KEY is not configured. Add it via: supabase secrets set OPENAI_API_KEY=sk-..." }, 503);
    }

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return json({ error: "prompt is required" }, 400);
    }

    const requested = Math.max(1, Math.min(Number(count) || 1, MAX_COUNT));
    const finalPrompt = buildFinalPrompt(prompt);

    console.log(`Generating ${requested} image(s) for platform=${platform}: ${finalPrompt.slice(0, 100)}...`);

    const results = await Promise.allSettled(
      Array.from({ length: requested }, async () => {
        const base64 = await generateGptImage(openaiKey, finalPrompt, platform);
        const fileName = `social/${platform}/${crypto.randomUUID()}_${Date.now()}.png`;
        return persistGeneratedImage(supabase, base64, fileName);
      }),
    );

    const images = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
      .map((r) => r.value);

    if (images.length === 0) {
      const firstError = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      const msg = firstError?.reason instanceof Error ? firstError.reason.message : "Image generation failed";
      return json({ error: msg }, 502);
    }

    console.log(`Generated ${images.length}/${requested} image(s)`);
    return json({ images });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("generate-social-image error:", msg);

    try {
      await supabase.from("automation_alerts").insert({
        alert_type: "function_error",
        severity: "error",
        title: "generate-social-image failed",
        message: msg,
        source: "generate-social-image",
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch { /* best-effort */ }

    return json({ error: msg }, 500);
  }
});
