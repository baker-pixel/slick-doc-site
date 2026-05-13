import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ContextProfile {
  services?: string[];
  differentiators?: string[];
  target_audience?: string;
  location?: string;
  tone?: string;
  business_summary?: string;
}

interface ClientInfo {
  id: string;
  business_name: string;
  tier: string;
  industry: string | null;
  website_url: string | null;
  context_profile?: ContextProfile | null;
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SEASONS: Record<number, string> = { 0:"winter",1:"winter",2:"spring",3:"spring",4:"spring",5:"summer",6:"summer",7:"summer",8:"fall",9:"fall",10:"fall",11:"winter" };

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
  if (!GROQ_API_KEY) {
    return new Response(
      JSON.stringify({ error: "GROQ_API_KEY is not configured" }),
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

    // Fetch client info — including context_profile and intake status
    const clientIds = [...new Set(slots.map((s: any) => s.client_account_id))];
    const { data: clients } = await supabase
      .from("client_accounts")
      .select("id, business_name, tier, industry, website_url, context_profile, intake_completed_at")
      .in("id", clientIds);

    // Alert for any clients missing context_profile — content generation is blocked for them
    const clientsWithoutContext = (clients || []).filter((c: any) => !c.context_profile);
    for (const c of clientsWithoutContext) {
      console.warn(`Skipping content for ${c.business_name} — no context_profile and intake not complete`);
      await supabase.from("automation_alerts").insert({
        alert_type: "missing_context",
        severity: "warning",
        title: `Content blocked for ${c.business_name} — intake form not submitted`,
        message: `${c.business_name} has scheduled content slots but no context profile. Ask the client to complete their intake form so AI content can be generated.`,
        source: "fill-scheduled-content",
        metadata: { client_id: c.id, business_name: c.business_name, timestamp: new Date().toISOString() },
      }).select().maybeSingle(); // fire-and-forget, ignore dupe errors
    }

    // Only process clients that have a context_profile
    const clientMap = Object.fromEntries(
      (clients || [])
        .filter((c: any) => !!c.context_profile)
        .map((c: any) => [c.id, c as ClientInfo])
    );

    // Fetch recent content per client to avoid topic repetition
    const { data: recentContent } = await supabase
      .from("content_calendar")
      .select("client_account_id, platform, title, content")
      .in("client_account_id", clientIds)
      .not("content", "like", "[Auto-generated placeholder%")
      .in("status", ["scheduled", "published"])
      .order("scheduled_for", { ascending: false })
      .limit(clientIds.length * 8);

    // Group recent content by client
    const recentByClient: Record<string, string[]> = {};
    for (const item of recentContent || []) {
      if (!recentByClient[item.client_account_id]) recentByClient[item.client_account_id] = [];
      if (recentByClient[item.client_account_id].length < 6) {
        recentByClient[item.client_account_id].push(item.title);
      }
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const slot of slots) {
      try {
        const client = clientMap[slot.client_account_id];
        if (!client) throw new Error("Client not found");

        const recentTopics = recentByClient[slot.client_account_id] || [];
        const generatedContent = await generateContent(slot, client, recentTopics, GROQ_API_KEY);

        // Update the calendar slot with the generated draft text so it's previewable,
        // but leave status="draft" and client_approved=false — the slot is NOT schedulable
        // until admin reviews, client approves, and handle-approval creates the scheduled row.
        const { error: updateErr } = await supabase
          .from("content_calendar")
          .update({
            content: generatedContent,
            metadata: {
              ...((slot.metadata as object) || {}),
              ai_draft_generated: true,
              generated_at: new Date().toISOString(),
              context_used: !!(client.context_profile),
            },
          })
          .eq("id", slot.id);

        if (updateErr) throw new Error(`Failed to update slot draft text: ${updateErr.message}`);

        // Save the draft to generated_content for admin review.
        // Include full traceability metadata so the admin panel can link back to the slot.
        const { data: draftRecord, error: draftErr } = await supabase
          .from("generated_content")
          .insert({
            client_id: slot.client_account_id,
            content_type: slot.content_type,
            title: slot.title,
            content: generatedContent,
            status: "pending_admin_review",
            metadata: {
              source: "fill-scheduled-content",
              content_calendar_slot_id: slot.id,
              platform: slot.platform,
              scheduled_for: slot.scheduled_for,
              context_used: !!(client.context_profile),
              generated_at: new Date().toISOString(),
            },
          })
          .select("id")
          .single();

        if (draftErr) {
          console.error(`generated_content insert failed for slot ${slot.id}:`, draftErr.message);
          await supabase.from("automation_alerts").insert({
            alert_type: "data_error",
            severity: "warning",
            title: "generated_content insert failed in fill-scheduled-content",
            message: draftErr.message,
            source: "fill-scheduled-content",
            metadata: { slot_id: slot.id, client_id: slot.client_account_id, timestamp: new Date().toISOString() },
          }).catch(() => {});
        }

        // Notify admins that a draft is ready for review.
        await supabase.from("activity_feed").insert({
          client_account_id: slot.client_account_id,
          activity_type: "content_draft_ready",
          title: `Draft ready for admin review: ${slot.title}`,
          description: `${slot.content_type} generated for ${slot.platform} — needs admin review before going to client.`,
          icon: "file-text",
          metadata: {
            content_calendar_slot_id: slot.id,
            generated_content_id: draftRecord?.id || null,
            platform: slot.platform,
            scheduled_for: slot.scheduled_for,
          },
        }).catch(() => {});

        console.log(`Draft saved for slot ${slot.id} (${slot.platform}/${slot.content_type}) — awaiting admin review`);
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
        metadata: { function_name: "fill-scheduled-content", timestamp: new Date().toISOString() },
      });
    } catch (_) { /* ignore */ }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function generateContent(
  slot: any,
  client: ClientInfo,
  recentTopics: string[],
  apiKey: string
): Promise<string> {
  const now = new Date();
  const month = MONTHS[now.getMonth()];
  const season = SEASONS[now.getMonth()];

  const { system, user } = buildPrompt(slot.content_type, slot.platform, client, recentTopics, month, season);

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1200,
      temperature: 0.75,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("No content returned from AI");
  return content;
}

function buildClientContext(client: ClientInfo): string {
  const ctx = client.context_profile;
  const industry = client.industry || "local business";
  const biz = client.business_name;

  if (!ctx) {
    return `${biz} is a ${industry} business.`;
  }

  const parts: string[] = [];

  if (ctx.business_summary) {
    parts.push(ctx.business_summary);
  } else {
    parts.push(`${biz} is a ${industry} business.`);
  }

  if (ctx.services?.length) {
    parts.push(`Services offered: ${ctx.services.slice(0, 6).join(", ")}.`);
  }

  if (ctx.differentiators?.length) {
    parts.push(`What sets them apart: ${ctx.differentiators.slice(0, 4).join(", ")}.`);
  }

  if (ctx.target_audience) {
    parts.push(`Target audience: ${ctx.target_audience}.`);
  }

  if (ctx.location) {
    parts.push(`Located in: ${ctx.location}.`);
  }

  return parts.join(" ");
}

function getBrandVoice(client: ClientInfo): string {
  const tone = client.context_profile?.tone;
  const map: Record<string, string> = {
    professional: "professional, authoritative, and trustworthy",
    friendly: "warm, approachable, and conversational",
    casual: "casual, relaxed, and relatable",
    expert: "expert-level, data-driven, and confident",
  };
  return map[tone || ""] || "professional yet approachable";
}

function avoidRepetitionInstruction(recentTopics: string[]): string {
  if (!recentTopics.length) return "";
  return `\n\nRecently covered topics to avoid repeating: ${recentTopics.slice(0, 5).join(" | ")}. Choose a fresh angle.`;
}

function buildPrompt(
  contentType: string,
  platform: string,
  client: ClientInfo,
  recentTopics: string[],
  month: string,
  season: string
): { system: string; user: string } {
  const biz = client.business_name;
  const industry = client.industry || "local business";
  const clientContext = buildClientContext(client);
  const brandVoice = getBrandVoice(client);
  const avoidRepeat = avoidRepetitionInstruction(recentTopics);
  const services = client.context_profile?.services || [];
  const differentiators = client.context_profile?.differentiators || [];
  const location = client.context_profile?.location || "";
  const targetAudience = client.context_profile?.target_audience || "local customers";

  const system = `You are an expert digital marketing copywriter for ${biz}.

BUSINESS CONTEXT:
${clientContext}

BRAND VOICE: ${brandVoice}
PLATFORM: ${platform}
CURRENT MONTH: ${month} (${season} season)

RULES:
- Write ONLY the final content — no labels, preamble, meta-commentary, or "here is your post" phrases
- Be specific to ${biz}'s actual services and differentiators — never generic filler
- Every piece must sound like it comes from this specific business, not a template
- Reference ${month} or ${season} naturally only when it adds genuine value`;

  switch (contentType) {
    case "social_post": {
      if (platform === "google_business") {
        return {
          system,
          user: `Write a Google Business Profile post for ${biz}.

Pick ONE of these angles (choose what hasn't been covered recently):
${services.length ? `- Highlight a specific service: ${services.slice(0, 3).join(", ")}` : "- A service highlight"}
${differentiators.length ? `- Emphasize a differentiator: ${differentiators[0]}` : "- A trust-building fact"}
- A timely ${month} tip relevant to ${industry} customers
- A customer outcome or before/after story
- A seasonal reminder relevant to ${industry}

Requirements:
- 150–300 words
- One clear CTA (call, visit, book, get a quote)
- Specific to ${biz} — mention actual services, not vague industry terms
- Conversational and trust-building${avoidRepeat}`,
        };
      }

      if (platform === "linkedin") {
        return {
          system,
          user: `Write a LinkedIn post for ${biz}.

Audience: ${targetAudience}, professionals in ${location || "the area"}.

Pick ONE angle:
${differentiators.length ? `- Thought leadership around: ${differentiators.slice(0, 2).join(" or ")}` : "- An industry insight"}
${services.length ? `- A business insight tied to: ${services[0]}` : "- A service highlight"}
- A behind-the-scenes story showing expertise
- A lesson learned or industry trend in ${industry} for ${month}
- A client win (anonymized)

Requirements:
- 150–250 words
- Hook in the first line (no "I" opener)
- 3–5 targeted hashtags at the end
- Authoritative but human${avoidRepeat}`,
        };
      }

      if (platform === "facebook") {
        return {
          system,
          user: `Write a Facebook post for ${biz}.

Audience: ${targetAudience}${location ? ` in ${location}` : ""}.

Pick ONE angle:
${services.length ? `- A helpful tip related to: ${services[Math.floor(Math.random() * Math.min(services.length, 3))]}` : "- A helpful tip"}
- A community connection or local story
${differentiators.length ? `- Show off: ${differentiators[0]}` : "- A trust signal"}
- A ${season} reminder or seasonal offer
- Ask a question that drives comments

Requirements:
- 100–200 words
- Warm, friendly, community-focused tone
- End with an engaging question or CTA
- Feel human, not corporate${avoidRepeat}`,
        };
      }

      if (platform === "instagram") {
        return {
          system,
          user: `Write an Instagram caption for ${biz}.

Pick ONE angle:
${services.length ? `- Visual service showcase: ${services[0]}` : "- A service feature"}
- A transformation or before/after concept
- A motivational or relatable moment for ${targetAudience}
- Behind-the-scenes of the ${industry} process
- A ${month} themed visual moment

Requirements:
- 80–150 words of caption
- Hook in the first line (before the "more" cut)
- 8–12 relevant hashtags after a line break
- Conversational, visual, aspirational${avoidRepeat}`,
        };
      }

      // Generic social
      return {
        system,
        user: `Write a ${platform} post for ${biz} (${industry}). 100–200 words. Specific to their services (${services.slice(0, 3).join(", ") || industry}). Clear CTA.${avoidRepeat}`,
      };
    }

    case "blog_post": {
      const tier = (client.tier || "foundation").toLowerCase();
      const wordCount = tier === "transformation" ? "1,000–1,200 words" : tier === "growth" ? "600–800 words" : "400–600 words";
      const serviceFocus = services.length ? `Focus on one of these services: ${services.slice(0, 4).join(", ")}.` : "";
      return {
        system,
        user: `Write a blog post for ${biz}.

${serviceFocus}
Target reader: ${targetAudience}

Pick ONE topic that would genuinely help this audience:
- A how-to guide solving a common ${industry} problem
- An FAQ answering questions ${targetAudience} always ask
- A seasonal guide relevant to ${month} for ${industry} customers
- Mistakes to avoid when choosing a ${industry} provider
${differentiators.length ? `- Why ${differentiators[0]} matters (educational angle)` : "- What to look for in a quality provider"}

Structure:
- Engaging H1 title
- Intro (why this matters to the reader)
- 3–4 sections with H2 subheadings
- Specific tips, not vague advice
- Conclusion with a CTA to contact ${biz}

Length: ${wordCount}
Tone: ${brandVoice}${avoidRepeat}`,
      };
    }

    case "email_copy": {
      return {
        system,
        user: `Write a marketing email for ${biz}.

Recipient: ${targetAudience}
Month context: ${month}

Format exactly:
Subject: [compelling, specific subject line — not generic]
---
Hi [First Name],

[Opening line that references something timely — ${month}, a common ${industry} challenge, or a seasonal need]

[1–2 paragraphs of genuine value: a tip, an insight, or a relevant offer tied to ${services[0] || industry}]

${differentiators.length ? `[One sentence on what makes ${biz} different: ${differentiators[0]}]` : ""}

[CTA — specific action with a reason to click now]

The ${biz} Team

Requirements:
- Under 220 words total
- Subject line under 50 characters
- Specific to ${biz}'s services — no generic marketing fluff
- Conversational, helpful, not salesy${avoidRepeat}`,
      };
    }

    case "ad_copy": {
      return {
        system,
        user: `Write Google Ads copy for ${biz}.

Service focus: ${services[0] || industry}
Audience: ${targetAudience}${location ? ` in ${location}` : ""}
${differentiators.length ? `Key differentiator: ${differentiators[0]}` : ""}

Format exactly (respect character limits):
Headline 1: [max 30 chars — lead with service/benefit]
Headline 2: [max 30 chars — differentiator or location]
Headline 3: [max 30 chars — CTA]
Description 1: [max 90 chars — specific benefit + social proof if possible]
Description 2: [max 90 chars — CTA + urgency]

Be specific. "Same-Day HVAC Repair" beats "Quality Service". Use real differentiators.${avoidRepeat}`,
      };
    }

    default:
      return {
        system,
        user: `Write marketing content for ${biz} on ${platform}. 150–200 words. Reference their actual services (${services.slice(0, 3).join(", ") || industry}). Professional, engaging, with a clear CTA.${avoidRepeat}`,
      };
  }
}

