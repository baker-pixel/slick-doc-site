import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { isServiceRequest } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/http.ts";
import { callAI, NO_FABRICATION_GUARDRAIL } from "../_shared/ai.ts";
import { getClientBrandKit, brandKitToPromptBlock } from "../_shared/brandKit.ts";

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
    if (!isServiceRequest(req)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { client_id, workflow_id, step_id } = await req.json();
    if (!client_id) return json({ error: "client_id required" }, 400);

    // Skip if a pending approval already exists for this client.
    // "pending" is the one canonical awaiting-client status across the
    // pipeline — the client UI only renders Approve buttons for it and
    // send-approval-reminders only nudges on it.
    const { data: existing } = await supabase
      .from("content_approvals")
      .select("id")
      .eq("client_account_id", client_id)
      .eq("status", "pending")
      .maybeSingle();

    if (existing) {
      console.log(`Approval draft already exists for client ${client_id}, skipping`);
      return json({ success: true, skipped: true });
    }

    // Fetch client data. Note: `tone` (a plain column) used to be read here
    // instead of context_profile.tone -- a different, stale duplicate of the
    // same concept that fill-scheduled-content and the rest of the pipeline
    // actually use. Dropped in favor of the shared brand kit below.
    const { data: client, error: clientErr } = await supabase
      .from("client_accounts")
      .select("business_name, industry, website_summary, website_url, context_profile")
      .eq("id", client_id)
      .single();

    if (clientErr || !client) return json({ error: "Client not found" }, 404);

    // Same brand kit source run-automation and fill-scheduled-content use --
    // this used to hand-roll a thinner brand_assets query here (headline/
    // description/colors only, no voice/pillars/differentiators/"never say").
    const kit = await getClientBrandKit(supabase, client_id);
    const brandBlock = brandKitToPromptBlock(kit);
    const fallbackTone = (client.context_profile as { tone?: string } | null)?.tone;

    // Build prompt context
    const businessContext = [
      `Business: ${client.business_name}`,
      client.industry ? `Industry: ${client.industry}` : null,
      client.website_summary ? `About: ${client.website_summary}` : null,
      brandBlock,
      // Only relevant if the brand kit above found no confirmed voice info.
      !kit.voice.tone_descriptors.length && fallbackTone ? `Brand tone preference: ${fallbackTone}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    // No canned fallback copy: this is the client's FIRST impression and
    // approving it queues it for publishing, so a generic "Excited to share
    // what we've been building at X!" post (which asserts things we never
    // checked) is worse than a short delay. Throwing here returns non-2xx so
    // process-agent-jobs retries and, if it keeps failing, dead-letters with
    // an alert an admin can act on.
    const postContent = (await callAI({
      source: "generate-approval-draft",
      system:
        `You are an expert marketing copywriter. Write a single LinkedIn post for the business described. The post should be professional, engaging, and 150–250 words. Include 2–3 relevant hashtags at the end. Return ONLY the post text — no commentary, no subject line, no title.${NO_FABRICATION_GUARDRAIL}`,
      prompt: `Write a compelling LinkedIn post introducing this business to potential customers.\n\n${businessContext}`,
      maxTokens: 400,
    })).trim();
    if (postContent.length < 80) {
      throw new Error(`AI returned an unusably short draft (${postContent.length} chars) for client ${client_id}`);
    }
    const postPreview = postContent.split("\n")[0].substring(0, 200);

    // Insert into content_approvals for client to review
    const { error: insertErr } = await supabase.from("content_approvals").insert({
      client_account_id: client_id,
      title: `Introductory LinkedIn Post — ${client.business_name}`,
      content_type: "linkedin_post",
      platform: "linkedin",
      content_preview: postPreview,
      full_content: postContent,
      status: "pending",
      submitted_at: new Date().toISOString(),
      publish_status: "draft",
    });

    if (insertErr) {
      console.error("Failed to insert content_approvals:", insertErr.message);
      return json({ error: insertErr.message }, 500);
    }

    // Log to automation_alerts so admin can see this was generated
    await supabase.from("automation_alerts").insert({
      alert_type: "info",
      severity: "info",
      title: "First content draft generated",
      message: `Auto-generated LinkedIn post draft for ${client.business_name} is awaiting client approval.`,
      source: "generate-approval-draft",
      source_id: client_id,
      metadata: { client_id, workflow_id, step_id },
    }).then(undefined, () => {});

    return json({ success: true });
  } catch (err: any) {
    console.error("generate-approval-draft error:", err);
    return json({ error: err?.message || "Internal error" }, 500);
  }
});
