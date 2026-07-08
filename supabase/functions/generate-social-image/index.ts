import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkAdminAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_COUNT = 4;

// DALL-E 3 only supports n=1 per request (unlike DALL-E 2) -- generating
// multiple variations means multiple parallel requests, not a single call
// with n>1.
function buildFinalPrompt(prompt: string, platform: string): string {
  return [
    prompt.trim(),
    `Style: bright, clean, modern business photography.`,
    `Platform: ${platform}. Aspect ratio: square (1:1).`,
    `No text overlays, no logos, no watermarks.`,
  ].join(" ");
}

async function generateOne(openaiKey: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",   // square — works for Instagram feed + Stories crop
      quality: "standard", // "hd" costs 2× — standard is fine for social
      response_format: "url",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let msg = `Image generation failed (${res.status})`;
    try { msg = JSON.parse(errText)?.error?.message || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }

  const data = await res.json();
  const imageUrl: string | undefined = data.data?.[0]?.url;
  if (!imageUrl) throw new Error("No image URL returned from DALL-E");
  return imageUrl;
}

// DALL-E URLs expire in ~60 min — re-host in Supabase Storage so the URL is
// permanent. Falls back to the temporary URL if the download/upload fails;
// still usable, just time-limited.
async function persistImage(supabase: any, imageUrl: string, platform: string): Promise<string> {
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return imageUrl;

    const imageBytes = await imgRes.arrayBuffer();
    const fileName = `social/${platform}/${crypto.randomUUID()}_${Date.now()}.png`;

    const { error: uploadErr } = await supabase.storage
      .from("generated-images")
      .upload(fileName, imageBytes, { contentType: "image/png", upsert: true });

    if (uploadErr) {
      console.warn("Storage upload failed:", uploadErr.message, "— returning temporary DALL-E URL");
      return imageUrl;
    }

    const { data: publicData } = supabase.storage.from("generated-images").getPublicUrl(fileName);
    return publicData.publicUrl;
  } catch (e) {
    console.warn("Failed to persist image, returning temporary DALL-E URL:", e instanceof Error ? e.message : e);
    return imageUrl;
  }
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

    const auth = await checkAdminAuth(req, supabase, password);
    if (!auth.authorized) return json({ error: "Unauthorized" }, 401);

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
        const rawUrl = await generateOne(openaiKey, finalPrompt);
        return persistImage(supabase, rawUrl, platform);
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

    await supabase.from("automation_alerts").insert({
      alert_type: "function_error",
      severity: "error",
      title: "generate-social-image failed",
      message: msg,
      source: "generate-social-image",
      metadata: { timestamp: new Date().toISOString() },
    }).catch(() => {});

    return json({ error: msg }, 500);
  }
});
