import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function generateSingleImage(apiKey: string, prompt: string): Promise<string | null> {
      const _sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      console.error("Image generation failed:", response.status);
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.images?.[0]?.image_url?.url || null;
  } catch (error) {
    console.error("Error generating image:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, platform, count = 4 } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Create varied prompts for different image styles
    const styleVariations = [
      "clean, minimal, professional photography style",
      "vibrant, colorful, modern illustration style",
      "warm, inviting, lifestyle photography style",
      "bold, dynamic, corporate design style",
    ];

    const basePrompt = `Create a professional, eye-catching social media image for ${platform}. ${prompt}. 
The image should be suitable for marketing. No text or words in the image.`;

    console.log("Generating", count, "images for:", platform);

    // Generate multiple images in parallel
    const imagePromises = styleVariations.slice(0, count).map((style, index) => {
      const variedPrompt = `${basePrompt} Style: ${style}. Variation ${index + 1}.`;
      return generateSingleImage(LOVABLE_API_KEY, variedPrompt);
    });

    const results = await Promise.all(imagePromises);
    const images = results.filter((url): url is string => url !== null);

    console.log("Generated", images.length, "images successfully");

    if (images.length === 0) {
      throw new Error("Failed to generate any images");
    }

    return new Response(
      JSON.stringify({ images }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error generating images:", error);

    try {
      await _sb.from('automation_alerts').insert({
        alert_type: 'function_error',
        severity: 'error',
        title: `Error in generate-social-image`,
        message: error instanceof Error ? error.message : 'Unknown error',
        source: 'generate-social-image',
        metadata: {
          function_name: 'generate-social-image',
          client_id: null,
          error_message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (_alertErr) { console.error('Failed to log alert:', _alertErr); }
    const errorMessage = error instanceof Error ? error.message : "Failed to generate images";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
