import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getClientBrandKit, brandKitToPromptBlock } from "../_shared/brandKit.ts";
import { corsHeaders } from "../_shared/http.ts";
import { callAI } from "../_shared/ai.ts";
import { checkClientOrAdminAuth } from "../_shared/auth.ts";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { client_id, password } = await req.json();
    if (!client_id) return json({ error: "client_id is required" }, 400);

    const auth = await checkClientOrAdminAuth(req, supabase, client_id, password);
    if (!auth.authorized) return json({ error: "Unauthorized" }, 401);

    const kit = await getClientBrandKit(supabase, client_id, true);

    // Require at least 3 confirmed assets including at least one brand_voice
    const { data: confirmedAssets } = await supabase
      .from("brand_assets")
      .select("id, asset_type")
      .eq("client_account_id", client_id)
      .eq("confirmed", true);

    const confirmed = confirmedAssets || [];
    const hasVoice = confirmed.some((a) => a.asset_type === "brand_voice");

    if (confirmed.length < 3 || !hasVoice) {
      return json({
        error: "Need at least 3 confirmed assets including at least one brand voice asset before generating guidelines.",
      }, 422);
    }

    const prompt = `Generate a professional brand guidelines document in markdown for this client.

${brandKitToPromptBlock(kit)}
${kit.business.target_audience ? `Target audience: ${kit.business.target_audience}` : ""}
${kit.business.differentiators.length > 0 ? `Differentiators: ${kit.business.differentiators.join(", ")}` : ""}
${kit.business.location ? `Location: ${kit.business.location}` : ""}

Write a complete brand guidelines document with these sections:

# Brand Overview
Brief description: name, industry, value proposition, what makes them different.

# Brand Voice & Tone
Tone descriptors, dos and don'ts, example phrases that sound on-brand vs off-brand.

# Visual Identity
Logo usage notes, colour palette with hex codes, typography guidance.

# Messaging Pillars
3 pillars with a name, one-sentence description, and example application for each.

# Target Audience
Who they are, how they describe their problems, what language resonates.

# Content Examples
- 2 example social captions in brand voice
- 1 example email subject line
- 1 example CTA

Keep it concise and actionable. Write for a marketing team that has never worked with this client before.`;

    const guidelinesMarkdown = await callAI({
      source: "generate-brand-guidelines",
      system: "You are a senior brand strategist. Write professional brand guidelines in markdown. Be specific and actionable. Return only the markdown document, no preamble.",
      prompt,
      maxTokens: 2000,
      temperature: 0.4,
    });

    const generatedAt = new Date().toISOString();
    const title = `${kit.business.name} — Brand Guidelines`;

    // Save to generated_content
    const { data: contentRow, error: contentErr } = await supabase
      .from("generated_content")
      .insert({
        client_id,
        content_type: "brand_guidelines",
        title,
        content: guidelinesMarkdown,
        status: "approved",
        metadata: {
          source: "generate-brand-guidelines",
          generated_at: generatedAt,
          brand_kit_snapshot: {
            colors: kit.visual.color_palette,
            fonts: [kit.visual.primary_font, kit.visual.secondary_font].filter(Boolean),
            tone: kit.voice.tone_descriptors,
          },
        },
      })
      .select("id")
      .single();

    if (contentErr) throw contentErr;

    // Save to deliverables
    const { data: deliverableRow, error: delivErr } = await supabase
      .from("deliverables")
      .insert({
        client_account_id: client_id,
        title,
        description: "Auto-generated brand guidelines document based on confirmed brand assets.",
        category: "brand_kit",
        status: "approved",
        submitted_at: generatedAt,
      })
      .select("id")
      .single();

    if (delivErr) console.error("Deliverable insert failed (non-fatal):", delivErr);

    // Upload markdown to storage
    const filePath = `${client_id}/brand-guidelines.md`;
    const uploadBytes = new TextEncoder().encode(guidelinesMarkdown);
    const { error: uploadErr } = await supabase.storage
      .from("brand-assets")
      .upload(filePath, uploadBytes, {
        contentType: "text/markdown",
        upsert: true,
      });

    if (uploadErr) console.error("Storage upload failed (non-fatal):", uploadErr);

    // Activity feed
    await supabase.from("activity_feed").insert({
      client_account_id: client_id,
      activity_type: "brand_guidelines_generated",
      title: `Brand guidelines generated for ${kit.business.name}`,
      description: "Brand guidelines document created from confirmed brand assets.",
      icon: "book-open",
      metadata: { content_id: contentRow?.id, deliverable_id: deliverableRow?.id },
    }).catch(() => {});

    return json({
      success: true,
      content_id: contentRow?.id,
      deliverable_id: deliverableRow?.id,
      title,
    });
  } catch (err: any) {
    console.error("generate-brand-guidelines error:", err);
    return json({ error: err?.message || "Internal error" }, 500);
  }
});
