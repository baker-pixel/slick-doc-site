import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ClientInfo {
  id: string;
  business_name: string;
  tier: string;
  industry: string | null;
  website_url: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const clientId: string | undefined = body.client_id;
    const limit: number = Math.min(body.limit || 10, 50);

    // Fetch placeholder slots
    let query = supabase
      .from("content_calendar")
      .select("id, client_account_id, title, content_type, platform, scheduled_for, metadata")
      .like("content", "[Auto-generated placeholder%")
      .in("status", ["draft"])
      .eq("client_approved", false)
      .order("scheduled_for", { ascending: true })
      .limit(limit);

    if (clientId) {
      query = query.eq("client_account_id", clientId);
    }

    const { data: slots, error: fetchErr } = await query;
    if (fetchErr) throw new Error(`Failed to fetch placeholder slots: ${fetchErr.message}`);

    if (!slots || slots.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, message: "No placeholder slots found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${slots.length} placeholder slots to fill`);

    // Fetch client info for all unique clients in one query
    const clientIds = [...new Set(slots.map((s: any) => s.client_account_id))];
    const { data: clients } = await supabase
      .from("client_accounts")
      .select("id, business_name, tier, industry, website_url")
      .in("id", clientIds);

    const clientMap = Object.fromEntries(
      (clients || []).map((c: any) => [c.id, c as ClientInfo])
    );

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const slot of slots) {
      try {
        const client = clientMap[slot.client_account_id];
        if (!client) throw new Error("Client not found");

        const generatedContent = await generateContent(slot, client, ANTHROPIC_API_KEY);

        // Update the slot: auto-approve so publish-scheduled-content picks it up
        const { error: updateErr } = await supabase
          .from("content_calendar")
          .update({
            content: generatedContent,
            status: "scheduled",
            client_approved: true,
            metadata: {
              ...((slot.metadata as object) || {}),
              ai_generated: true,
              generated_at: new Date().toISOString(),
            },
          })
          .eq("id", slot.id);

        if (updateErr) throw new Error(`Failed to update slot: ${updateErr.message}`);

        // Create content_approvals row for audit trail / client portal visibility
        await supabase.from("content_approvals").insert({
          client_account_id: slot.client_account_id,
          content_type: mapApprovalContentType(slot.content_type),
          platform: slot.platform,
          title: slot.title,
          content_preview: generatedContent.substring(0, 500),
          full_content: generatedContent,
          status: "approved",
          approved_at: new Date().toISOString(),
          publish_status: "queued",
          scheduled_for: slot.scheduled_for,
          metadata: { content_calendar_id: slot.id, auto_approved: true },
        });

        console.log(`Filled ${slot.id} (${slot.platform}/${slot.content_type})`);
        results.push({ id: slot.id, success: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Failed to fill slot ${slot.id}:`, msg);
        results.push({ id: slot.id, success: false, error: msg });
      }
    }

    return new Response(
      JSON.stringify({
        processed: results.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("fill-scheduled-content error:", error);

    try {
      await supabase.from("automation_alerts").insert({
        alert_type: "function_error",
        severity: "error",
        title: "Error in fill-scheduled-content",
        message: error instanceof Error ? error.message : "Unknown error",
        source: "fill-scheduled-content",
        metadata: {
          function_name: "fill-scheduled-content",
          timestamp: new Date().toISOString(),
        },
      });
    } catch (_) { /* ignore */ }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function generateContent(slot: any, client: ClientInfo, apiKey: string): Promise<string> {
  const biz = client.business_name;
  const industry = client.industry || "local business";
  const locationStr = "";
  const tier = (client.tier || "foundation").toLowerCase();

  const { system, user } = buildPrompt(slot.content_type, slot.platform, biz, industry, locationStr, tier);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.content?.[0]?.text?.trim();
  if (!content) throw new Error("No content returned from AI");
  return content;
}

function buildPrompt(
  contentType: string,
  platform: string,
  biz: string,
  industry: string,
  locationStr: string,
  tier: string
): { system: string; user: string } {
  const system = `You are a professional digital marketing copywriter for ${biz}, a ${industry} business${locationStr}. Write compelling, authentic content that fits naturally on ${platform}. Return only the final content — no labels, preamble, or extra formatting.`;

  switch (contentType) {
    case "social_post": {
      if (platform === "google_business") {
        return {
          system,
          user: `Write a Google Business Profile post for ${biz} (${industry}${locationStr}). Choose a relevant topic: a recent achievement, a tip for customers, a service highlight, a seasonal message, or a customer success story. Keep it under 1,500 characters. Include one clear call-to-action. Conversational and trust-building.`,
        };
      }
      if (platform === "linkedin") {
        return {
          system,
          user: `Write a professional LinkedIn post for ${biz} (${industry}${locationStr}). Choose a relevant topic: an industry insight, a business win, a tip for clients, or a behind-the-scenes story. 150–250 words. End with 3–5 relevant hashtags. Authoritative but approachable tone.`,
        };
      }
      if (platform === "facebook") {
        return {
          system,
          user: `Write a Facebook post for ${biz} (${industry}${locationStr}). Choose an engaging topic: a customer story, a local community connection, a special offer, or a helpful tip. 100–200 words. Warm, friendly tone. End with a question to drive engagement.`,
        };
      }
      if (platform === "instagram") {
        return {
          system,
          user: `Write an Instagram caption for ${biz} (${industry}${locationStr}). Choose a visual, engaging topic: a behind-the-scenes moment, a transformation, a quote, or a product/service feature. 80–150 words. Conversational tone. Add 5–10 relevant hashtags at the end.`,
        };
      }
      return {
        system,
        user: `Write a social media post for ${biz} (${industry}${locationStr}) for ${platform}. 100–200 words. Engaging, platform-appropriate, with a clear call-to-action.`,
      };
    }

    case "blog_post": {
      const depth = tier === "transformation" ? "1,000–1,200 words" : tier === "growth" ? "600–800 words" : "400–500 words";
      return {
        system,
        user: `Write a blog post for ${biz} (${industry}${locationStr}). Choose a topic that their ideal customers would find genuinely useful — a how-to guide, an FAQ, a comparison, or an industry insight. Structure: engaging H1 title, intro paragraph, 3–4 sections with H2 subheadings, and a conclusion with a CTA to contact ${biz}. Length: ${depth}. Conversational but professional.`,
      };
    }

    case "email_copy": {
      return {
        system,
        user: `Write a marketing email for ${biz} (${industry}${locationStr}). Format:
Subject: [compelling subject line]
---
[Greeting],

[2–3 short paragraphs of value — a tip, update, or offer relevant to ${industry} customers]

[Clear CTA button text and reason to click]

The ${biz} Team

Keep it under 200 words, scannable, friendly but professional.`,
      };
    }

    case "ad_copy": {
      return {
        system,
        user: `Write Google Ads copy for ${biz} (${industry}${locationStr}). Format exactly:
Headline 1: [max 30 chars]
Headline 2: [max 30 chars]
Headline 3: [max 30 chars]
Description 1: [max 90 chars]
Description 2: [max 90 chars]
Focus on the business's strongest benefit and a clear call-to-action.`,
      };
    }

    default:
      return {
        system,
        user: `Write marketing content for ${biz} (${industry}${locationStr}). 150–200 words. Professional, engaging, with a call-to-action.`,
      };
  }
}

function mapApprovalContentType(ct: string): string {
  const map: Record<string, string> = {
    social_post: "social_post",
    blog_post: "blog_post",
    email_copy: "email",
    ad_copy: "ad_copy",
  };
  return map[ct] ?? ct;
}
