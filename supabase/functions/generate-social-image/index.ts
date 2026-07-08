import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkAdminAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_COUNT = 4;

function buildFinalPrompt(prompt: string, platform: string): string {
  return [
    prompt.trim(),
    `Style: bright, clean, modern business photography.`,
    `Platform: ${platform}. Aspect ratio: square (1:1).`,
    `No text overlays, no logos, no watermarks.`,
  ].join(" ");
}

// gpt-image-1 only supports n=1 per request -- generating multiple
// variations means multiple parallel requests, not a single call with n>1.
// Unlike dall-e-3 (retired March 2026), it does not accept response_format
// and always returns base64 (b64_json), never a hosted url.
async function generateOne(openaiKey: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: "1024x1024", // square — works for Instagram feed + Stories crop
      quality: "medium",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let msg = `Image generation failed (${res.status})`;
    try { msg = JSON.parse(errText)?.error?.message || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }

  const data = await res.json();
  const b64: string | undefined = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image data returned from gpt-image-1");
  return b64;
}

// Decode the base64 image and upload it to Supabase Storage for a permanent URL.
async function persistImage(supabase: any, base64: string, platform: string): Promise<string> {
  const imageBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const fileName = `social/${platform}/${crypto.randomUUID()}_${Date.now()}.png`;

  const { error: uploadErr } = await supabase.storage
    .from("generated-images")
    .upload(fileName, imageBytes, { contentType: "image/png", upsert: true });

  if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

  const { data: publicData } = supabase.storage.from("generated-images").getPublicUrl(fileName);
  return publicData.publicUrl;
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
    const finalPrompt = buildFinalPrompt(prompt, platform);

    console.log(`Generating ${requested} image(s) for platform=${platform}: ${finalPrompt.slice(0, 100)}...`);

    const results = await Promise.allSettled(
      Array.from({ length: requested }, async () => {
        const base64 = await generateOne(openaiKey, finalPrompt);
        return persistImage(supabase, base64, platform);
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
