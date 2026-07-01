import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Build a concise DALL-E prompt from the post caption and business name.
// Keeps it under 900 chars (DALL-E 3 limit is 4000 but shorter = more reliable).
function buildImagePrompt(caption: string, businessName: string, platform: string): string {
  // Strip hashtags — they add noise to the image prompt
  const cleanCaption = caption.replace(/#\w+/g, "").replace(/\s{2,}/g, " ").trim();
  // Take first 200 chars of the caption as context
  const snippet = cleanCaption.slice(0, 200);

  return [
    `Professional marketing photo for ${businessName}.`,
    `Context: ${snippet}`,
    `Style: bright, clean, modern business photography.`,
    `Platform: ${platform}. Aspect ratio: square (1:1).`,
    `No text overlays, no logos, no watermarks.`,
    `High quality, visually appealing, suitable for social media.`,
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

  if (!openaiKey) {
    return json({ error: "OPENAI_API_KEY is not configured. Add it via: supabase secrets set OPENAI_API_KEY=sk-..." }, 503);
  }

  try {
    const { caption, businessName, platform = "instagram", contentCalendarId } = await req.json();

    if (!caption || !businessName) {
      return json({ error: "caption and businessName are required" }, 400);
    }

    const prompt = buildImagePrompt(caption, businessName, platform);
    console.log(`Generating image for ${businessName} (${platform}): ${prompt.slice(0, 100)}...`);

    const dalleRes = await fetch("https://api.openai.com/v1/images/generations", {
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

    if (!dalleRes.ok) {
      const errText = await dalleRes.text();
      console.error("DALL-E error:", dalleRes.status, errText);
      let msg = `Image generation failed (${dalleRes.status})`;
      try { msg = JSON.parse(errText)?.error?.message || msg; } catch { /* ignore */ }
      return json({ error: msg }, 502);
    }

    const dalleData = await dalleRes.json();
    const imageUrl: string = dalleData.data?.[0]?.url;

    if (!imageUrl) {
      return json({ error: "No image URL returned from DALL-E" }, 500);
    }

    // Download the image and upload to Supabase Storage so the URL is permanent.
    // DALL-E URLs expire in ~60 min — storage URL lasts forever.
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      // Fallback: return the temporary URL; it's still valid for ~60 min which is
      // enough for PfM to fetch it during publishing.
      console.warn("Could not download image to storage — returning temporary DALL-E URL");
      if (contentCalendarId) {
        await patchCalendarMetadata(supabase, contentCalendarId, imageUrl);
      }
      return json({ imageUrl, permanent: false });
    }

    const imageBytes = await imgRes.arrayBuffer();
    const fileName = `social/${platform}/${contentCalendarId ?? crypto.randomUUID()}_${Date.now()}.png`;

    const { error: uploadErr } = await supabase.storage
      .from("generated-images")
      .upload(fileName, imageBytes, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadErr) {
      console.warn("Storage upload failed:", uploadErr.message, "— returning DALL-E URL");
      if (contentCalendarId) {
        await patchCalendarMetadata(supabase, contentCalendarId, imageUrl);
      }
      return json({ imageUrl, permanent: false });
    }

    const { data: publicData } = supabase.storage
      .from("generated-images")
      .getPublicUrl(fileName);

    const permanentUrl = publicData.publicUrl;

    // Patch the content_calendar metadata so next publish attempt uses the cached image
    if (contentCalendarId) {
      await patchCalendarMetadata(supabase, contentCalendarId, permanentUrl);
    }

    console.log(`Image generated and stored: ${permanentUrl}`);
    return json({ imageUrl: permanentUrl, permanent: true });
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

async function patchCalendarMetadata(
  supabase: ReturnType<typeof createClient>,
  calendarId: string,
  imageUrl: string,
) {
  const { data: row } = await supabase
    .from("content_calendar")
    .select("metadata")
    .eq("id", calendarId)
    .single();

  await supabase
    .from("content_calendar")
    .update({ metadata: { ...((row?.metadata as object) || {}), image_url: imageUrl } })
    .eq("id", calendarId);
}
