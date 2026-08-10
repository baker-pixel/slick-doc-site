import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/http.ts";
import { callAI, MODELS } from "../_shared/ai.ts";
import { feedbackToPromptBlock, type ContentFeedbackItem, approvedContentToPromptBlock, type ApprovedContentItem } from "../_shared/contentFeedback.ts";
import { critiqueContent, qaNeedsAttention } from "../_shared/contentQa.ts";
import { getSocialPillars } from "../_shared/socialStrategy.ts";
import { filterEngagedClients } from "../_shared/engagedClients.ts";
import { toDbContentType } from "../_shared/contentTypeMap.ts";
import { hasBusinessContext } from "../_shared/businessContext.ts";
import { getClientBrandKit, brandKitToPromptBlock, type BrandKit } from "../_shared/brandKit.ts";

// Platforms where a QA-passing draft skips the manual admin "send for
// approval" click and goes straight to the client's Approvals tab. Blog,
// email, and other content types stay on manual admin review.
const AUTO_FORWARD_PLATFORMS = new Set(["facebook", "instagram", "twitter", "linkedin"]);

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

    // Fetch placeholder slots. Past-due slots are excluded — there's no
    // point drafting content for a date that already passed; the daily
    // cleanup-expired-draft-content cron deletes them after a 1-day grace.
    let query = supabase
      .from("content_calendar")
      .select("id, client_account_id, title, content_type, platform, scheduled_for, metadata")
      .like("content", "[Auto-generated placeholder%")
      .in("status", ["draft"])
      .eq("client_approved", false)
      .gte("scheduled_for", new Date().toISOString().slice(0, 10))
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
    const { data: rawClients } = await supabase
      .from("client_accounts")
      .select("id, business_name, tier, industry, website_url, context_profile, intake_completed_at")
      .in("id", clientIds);

    // Skip clients whose portal invite was never accepted -- these slots
    // (e.g. from before this gate existed, or created manually) have nobody
    // to review them, so filling them just burns spend on drafts that
    // auto-delete unseen via cleanup-expired-draft-content.
    const clients = await filterEngagedClients(supabase, rawClients ?? []);

    // Alert for any clients missing real business info — content generation is blocked for them.
    // Checks industry + target_audience specifically, not just "context_profile is non-null"
    // (a client could have context_profile = {marketing_goal: "..."} with neither field set).
    const clientsWithoutContext = (clients || []).filter((c: any) => !hasBusinessContext(c));
    for (const c of clientsWithoutContext) {
      console.warn(`Skipping content for ${c.business_name} — missing industry/target audience`);
      await supabase.from("automation_alerts").insert({
        alert_type: "missing_context",
        severity: "warning",
        title: `Content blocked for ${c.business_name} — business info incomplete`,
        message: `${c.business_name} has scheduled content slots but hasn't provided industry/target audience yet. Ask the client to complete "Confirm Business Information" (or Settings → Company Context) so AI content can be generated.`,
        source: "fill-scheduled-content",
        metadata: { client_id: c.id, business_name: c.business_name, timestamp: new Date().toISOString() },
      }).select().maybeSingle(); // fire-and-forget, ignore dupe errors
    }

    // Only process clients with real business info
    const clientMap = Object.fromEntries(
      (clients || [])
        .filter((c: any) => hasBusinessContext(c))
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

    // Feedback loop: batch-fetch recent rejection reasons across all clients
    // in this run so drafts stop repeating issues admin/client already
    // flagged. Same table/shape as _shared/contentFeedback.ts's per-client
    // helper, queried in bulk here since we already have all clientIds.
    const { data: recentFeedbackRows } = await supabase
      .from("generated_content")
      .select("client_id, content_type, title, rejection_reason")
      .in("client_id", clientIds)
      .in("status", ["rejected", "changes_requested"])
      .not("rejection_reason", "is", null)
      .order("updated_at", { ascending: false })
      .limit(clientIds.length * 5);

    const feedbackByClient: Record<string, ContentFeedbackItem[]> = {};
    for (const item of recentFeedbackRows || []) {
      if (!feedbackByClient[item.client_id]) feedbackByClient[item.client_id] = [];
      if (feedbackByClient[item.client_id].length < 5) {
        feedbackByClient[item.client_id].push({
          content_type: item.content_type,
          title: item.title,
          reason: item.rejection_reason,
        });
      }
    }

    // Other half of the loop: real examples of content this client has
    // actually approved, so drafts have a positive style/voice/quality
    // reference, not just a list of past mistakes to avoid.
    const { data: recentApprovedRows } = await supabase
      .from("generated_content")
      .select("client_id, content_type, title, content")
      .in("client_id", clientIds)
      .in("status", ["approved", "client_approved", "published"])
      .order("updated_at", { ascending: false })
      .limit(clientIds.length * 3);

    const approvedByClient: Record<string, ApprovedContentItem[]> = {};
    for (const item of recentApprovedRows || []) {
      if (!approvedByClient[item.client_id]) approvedByClient[item.client_id] = [];
      if (approvedByClient[item.client_id].length < 3) {
        approvedByClient[item.client_id].push({
          content_type: item.content_type,
          title: item.title || "Untitled",
          content: item.content,
        });
      }
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    // Cache each client's social pillars + a rotating cursor, so posts spread
    // across the strategy's themes instead of clustering on one.
    const pillarsByClient: Record<string, string[]> = {};
    const pillarCursor: Record<string, number> = {};

    for (const slot of slots) {
      try {
        const client = clientMap[slot.client_account_id];
        if (!client) throw new Error("Client not found");

        const recentTopics = recentByClient[slot.client_account_id] || [];
        const recentFeedback = feedbackByClient[slot.client_account_id] || [];
        const recentApproved = approvedByClient[slot.client_account_id] || [];

        // On-strategy: pick the next pillar in rotation for this client.
        if (!(slot.client_account_id in pillarsByClient)) {
          pillarsByClient[slot.client_account_id] = await getSocialPillars(supabase, slot.client_account_id);
          pillarCursor[slot.client_account_id] = 0;
        }
        const pillars = pillarsByClient[slot.client_account_id];
        let pillar: string | undefined;
        if (pillars.length > 0) {
          pillar = pillars[pillarCursor[slot.client_account_id] % pillars.length];
          pillarCursor[slot.client_account_id]++;
        }

        const generatedContent = await generateContent(supabase, slot, client, recentTopics, recentFeedback, recentApproved, GROQ_API_KEY, pillar);

        // Self-QA: cheap second-model critique, best-effort. A QA failure
        // (null) never blocks the draft -- it just means no auto-forward.
        const qa = await critiqueContent(
          generatedContent,
          slot.content_type,
          client.context_profile?.tone || "professional",
          client.id,
        );
        const flagged = qaNeedsAttention(qa);
        // Social platforms always go straight to the client's approval queue --
        // admin review is not in this loop. QA still runs and is attached as
        // metadata so a flagged post is visible to the client/admin, it just
        // doesn't reroute it into the admin-only pending_admin_review queue.
        const autoForward = AUTO_FORWARD_PLATFORMS.has(slot.platform);

        // Save the draft to generated_content. Include full traceability
        // metadata so the admin panel can link back to the slot.
        const { data: draftRecord, error: draftErr } = await supabase
          .from("generated_content")
          .insert({
            client_id: slot.client_account_id,
            content_type: toDbContentType(slot.content_type),
            title: slot.title,
            content: generatedContent,
            status: autoForward ? "approved" : "pending_admin_review",
            metadata: {
              source: "fill-scheduled-content",
              content_calendar_slot_id: slot.id,
              platform: slot.platform,
              scheduled_for: slot.scheduled_for,
              context_used: !!(client.context_profile),
              generated_at: new Date().toISOString(),
              ...(qa ? { qa } : {}),
              ...(autoForward ? { auto_forwarded: true } : {}),
            },
          })
          .select("id")
          .single();

        if (draftErr) {
          console.error(`generated_content insert failed for slot ${slot.id}:`, draftErr.message);
          try {
            await supabase.from("automation_alerts").insert({
              alert_type: "data_error",
              severity: "warning",
              title: "generated_content insert failed in fill-scheduled-content",
              message: draftErr.message,
              source: "fill-scheduled-content",
              metadata: { slot_id: slot.id, client_id: slot.client_account_id, timestamp: new Date().toISOString() },
            });
          } catch { /* best-effort */ }
        }

        // Update the calendar slot with the generated draft text (and the
        // forward link to generated_content, so downstream consumers --
        // content_approvals matching, admin panel, this backfill's future
        // self) can join the two tables). Still leaves status="draft" and
        // client_approved=false unless auto-forwarded above — the slot is
        // NOT schedulable until a client_approvals row is approved and
        // handle-approval creates the scheduled row.
        const { error: updateErr } = await supabase
          .from("content_calendar")
          .update({
            content: generatedContent,
            content_id: draftRecord?.id ?? null,
            metadata: {
              ...((slot.metadata as object) || {}),
              ai_draft_generated: true,
              generated_at: new Date().toISOString(),
              context_used: !!(client.context_profile),
            },
          })
          .eq("id", slot.id);

        if (updateErr) throw new Error(`Failed to update slot draft text: ${updateErr.message}`);

        if (autoForward && draftRecord?.id) {
          // QA passed on a target social platform -- skip the manual admin
          // click and send straight to the client's Approvals tab.
          const { error: approvalErr } = await supabase.from("content_approvals").insert({
            client_account_id: slot.client_account_id,
            content_id: draftRecord.id,
            content_type: slot.content_type,
            title: slot.title || "Untitled",
            content_preview: generatedContent.substring(0, 300),
            full_content: generatedContent,
            status: "pending",
            publish_status: "pending",
            platform: slot.platform,
            scheduled_for: slot.scheduled_for,
            submitted_at: new Date().toISOString(),
          });

          if (approvalErr) {
            console.error(`content_approvals insert failed for slot ${slot.id}:`, approvalErr.message);
          }

          try {
            await supabase.from("activity_feed").insert({
              client_account_id: slot.client_account_id,
              activity_type: "content_sent_for_approval",
              title: `Sent to client for approval: ${slot.title}`,
              description: `${slot.content_type} for ${slot.platform} passed QA (score ${qa?.score ?? "n/a"}/10) and was sent straight to the client — no admin action needed.`,
              icon: "send",
              metadata: {
                content_calendar_slot_id: slot.id,
                generated_content_id: draftRecord.id,
                platform: slot.platform,
                scheduled_for: slot.scheduled_for,
                qa,
              },
            });
          } catch { /* best-effort */ }

          console.log(`Draft auto-forwarded to client approval for slot ${slot.id} (${slot.platform}/${slot.content_type})`);
        } else {
          // Notify admins that a draft is ready for review.
          try {
            await supabase.from("activity_feed").insert({
              client_account_id: slot.client_account_id,
              activity_type: "content_draft_ready",
              title: `Draft ready for admin review: ${slot.title}`,
              description: flagged
                ? `${slot.content_type} generated for ${slot.platform} — QA flagged it (score ${qa?.score}/10): ${qa?.issues.join("; ") || "brand tone mismatch"}.`
                : `${slot.content_type} generated for ${slot.platform} — needs admin review before going to client.`,
              icon: "file-text",
              metadata: {
                content_calendar_slot_id: slot.id,
                generated_content_id: draftRecord?.id || null,
                platform: slot.platform,
                scheduled_for: slot.scheduled_for,
                qa,
              },
            });
          } catch { /* best-effort */ }

          console.log(`Draft saved for slot ${slot.id} (${slot.platform}/${slot.content_type}) — awaiting admin review`);
        }

        results.push({ id: slot.id, success: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Failed to fill slot ${slot.id}:`, msg);
        results.push({ id: slot.id, success: false, error: msg });
      }
    }

    // Kick off image generation for any freshly-drafted slots that need one
    // (currently Instagram). Using sync-fill-missing-images (a few
    // synchronous gpt-image-2 calls) rather than the OpenAI Batch API path
    // (generate-social-images-batch + check-image-batches): the batch
    // approach is ~50% cheaper when it works, but repeatedly hit
    // WORKER_RESOURCE_LIMIT crashes downloading/applying batch output files
    // on this runtime and left real client-facing posts stuck with no
    // image for hours. generate-social-images-batch is left in place,
    // unused, in case that gets revisited later -- not deleted, just not
    // called from here anymore. Best-effort: a failure here shouldn't fail
    // the whole drafting run.
    try {
      const fillRes = await supabase.functions.invoke("sync-fill-missing-images", { body: {} });
      if (fillRes.error) {
        console.error("sync-fill-missing-images invoke failed:", fillRes.error.message);
      } else {
        console.log("Image fill result:", JSON.stringify(fillRes.data));
      }
    } catch (e) {
      console.error("Failed to invoke sync-fill-missing-images:", e instanceof Error ? e.message : e);
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
  supabase: any,
  slot: any,
  client: ClientInfo,
  recentTopics: string[],
  recentFeedback: ContentFeedbackItem[],
  recentApproved: ApprovedContentItem[],
  _apiKey: string,
  pillar?: string
): Promise<string> {
  const now = new Date();
  const month = MONTHS[now.getMonth()];
  const season = SEASONS[now.getMonth()];

  // Confirmed brand assets (logo colors, voice, pillars, "never say" list)
  // the client set up in "Verify Brand Assets" -- previously this generator
  // only had context_profile's 4-value tone enum, ignoring brand_assets
  // entirely even though the onboarding content generator already used it.
  const kit = await getClientBrandKit(supabase, client.id);

  const { system, user } = buildPrompt(slot.content_type, slot.platform, client, kit, recentTopics, recentFeedback, recentApproved, month, season, pillar);

  // Short-form platforms need fewer tokens — prevents the model padding to fill context
  const PLATFORM_MAX_TOKENS: Record<string, number> = {
    twitter: 120,
    instagram: 600,
    facebook: 600,
    linkedin: 700,
  };
  const maxTokens = PLATFORM_MAX_TOKENS[slot.platform] ?? 1200;

  let content = (await callAI({
    source: "fill-scheduled-content",
    promptId: `scheduled-content.${slot.content_type}.v1`,
    clientId: client.id,
    // Client-facing scheduled content gets the quality-tier model, falling
    // back to the default Groq model automatically if Claude is unavailable.
    model: MODELS.quality,
    fallbackModels: [MODELS.default],
    system,
    prompt: user,
    maxTokens,
    temperature: 0.75,
  })).trim();
  if (!content) throw new Error("No content returned from AI");
  const originalLength = content.length;

  // Hard-enforce character limits — safety net after generation
  const CHAR_LIMITS: Record<string, number> = {
    twitter: 270,
    instagram: 2200,
    linkedin: 2900,
    facebook: 63000,
  };
  const charLimit = CHAR_LIMITS[slot.platform];
  if (charLimit && content.length > charLimit) {
    const truncated = content.slice(0, charLimit - 3);
    const lastSpace = truncated.lastIndexOf(" ");
    content = (lastSpace > charLimit * 0.8 ? truncated.slice(0, lastSpace) : truncated) + "…";
    console.warn(`Content for ${slot.platform} truncated from ${originalLength} to ${content.length} chars`);
  }

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
  kit: BrandKit,
  recentTopics: string[],
  recentFeedback: ContentFeedbackItem[],
  recentApproved: ApprovedContentItem[],
  month: string,
  season: string,
  pillar?: string
): { system: string; user: string } {
  const biz = client.business_name;
  const industry = client.industry || "local business";
  const clientContext = buildClientContext(client);
  const brandVoice = getBrandVoice(client);
  // Real confirmed brand kit wins when the client has one; the tone-enum
  // guess is only a fallback for a client who hasn't confirmed any brand
  // voice assets yet.
  const hasBrandKit =
    kit.voice.tone_descriptors.length > 0 ||
    !!kit.voice.value_proposition ||
    !!kit.voice.tagline ||
    kit.voice.messaging_pillars.length > 0;
  const brandSection = hasBrandKit ? brandKitToPromptBlock(kit) : `BRAND VOICE: ${brandVoice}`;
  const toneLine = kit.voice.tone_descriptors.length > 0 ? kit.voice.tone_descriptors.join(", ") : brandVoice;
  const pillarLine = pillar ? `\nCONTENT PILLAR (anchor this post to this theme from the client's social plan): ${pillar}` : "";
  // The feedback loop, consumed: whats_working is refined from real outcomes
  // (client-context-refresh) and pulled here so content leans into what has
  // actually been resonating for this client.
  const working = (client.context_profile as { whats_working?: string[] } | null)?.whats_working;
  const workingLine = Array.isArray(working) && working.length
    ? `\nWHAT'S BEEN WORKING for this client (lean into these angles): ${working.join("; ")}`
    : "";
  const avoidRepeat = avoidRepetitionInstruction(recentTopics);
  const feedbackBlock = feedbackToPromptBlock(recentFeedback);
  const approvedBlock = approvedContentToPromptBlock(recentApproved);
  const services = client.context_profile?.services || [];
  const differentiators = client.context_profile?.differentiators || [];
  const location = client.context_profile?.location || "";
  const targetAudience = client.context_profile?.target_audience || "local customers";

  const system = `You are an expert digital marketing copywriter for ${biz}.

BUSINESS CONTEXT:
${clientContext}

${brandSection}
PLATFORM: ${platform}
CURRENT MONTH: ${month} (${season} season)${pillarLine}${workingLine}

RULES:
- Write ONLY the final content — no labels, preamble, meta-commentary, or "here is your post" phrases
- Be specific to ${biz}'s actual services and differentiators — never generic filler
- Every piece must sound like it comes from this specific business, not a template
- Reference ${month} or ${season} naturally only when it adds genuine value${approvedBlock ? `\n\n${approvedBlock}` : ""}${feedbackBlock ? `\n\n${feedbackBlock}` : ""}`;

  switch (contentType) {
    case "social_post": {
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

      if (platform === "twitter") {
        return {
          system,
          user: `Write a tweet for ${biz}.

HARD LIMIT: 240 characters total including spaces, punctuation, and hashtags. Count carefully.

Pick ONE angle:
${services.length ? `- A sharp insight about: ${services[0]}` : "- A sharp industry insight"}
${differentiators.length ? `- What makes ${biz} different: ${differentiators[0]}` : "- A trust signal"}
- A ${month} tip for ${targetAudience}

Requirements:
- MUST be ≤240 characters
- Punchy, no filler words
- End with 1 relevant hashtag maximum
- No "I" opener
- No quotes around the tweet${avoidRepeat}`,
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
Tone: ${toneLine}${avoidRepeat}`,
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

    case "google_post": {
      return {
        system,
        user: `Write a Google Business Profile post for ${biz}.

Audience: ${targetAudience}${location ? ` in ${location}` : ""}
Month context: ${month}
Service focus: ${services[0] || industry}
${differentiators.length ? `Differentiator to weave in: ${differentiators[0]}` : ""}

Requirements:
- 80–150 words (GBP truncates long posts)
- Lead with something timely or locally relevant — ${month}, a seasonal need, or a common ${industry} question
- One concrete tip, offer, or update — not generic promotion
- End with a short call to action (call, visit, book)
- No hashtags, no emojis beyond one at most${avoidRepeat}`,
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

