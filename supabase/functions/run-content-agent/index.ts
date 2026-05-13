import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getClientBrandKit, brandKitToPromptBlock } from "../_shared/brandKit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let taskId: string | null = null;

  try {
    const body = await req.json();
    taskId = body.task_id;

    if (!taskId) {
      return new Response(
        JSON.stringify({ error: "task_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the task
    const { data: task, error: taskError } = await supabase
      .from("workflow_tasks")
      .select("*")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      return new Response(
        JSON.stringify({ error: "Task not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the client
    const { data: client, error: clientError } = await supabase
      .from("client_accounts")
      .select("business_name, industry, tone, website_summary, context_profile")
      .eq("id", task.client_id)
      .single();

    if (clientError || !client) {
      await supabase
        .from("workflow_tasks")
        .update({ status: "failed", result: { error: "Client not found" } })
        .eq("id", taskId);
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update status to running
    await supabase
      .from("workflow_tasks")
      .update({ status: "running" })
      .eq("id", taskId);

    // Build the prompt
    const payload = task.payload || {};
    const contentType = payload.content_type || "social media post";
    const topic = payload.topic || "general marketing";
    const tone = client.tone || "professional";

    const ctx = client.context_profile as Record<string, unknown> | null;
    const servicesStr = Array.isArray(ctx?.services) && (ctx!.services as string[]).length > 0 ? (ctx!.services as string[]).join(', ') : (client.industry || 'general');
    const diffsStr = Array.isArray(ctx?.differentiators) && (ctx!.differentiators as string[]).length > 0 ? `Key differentiators: ${(ctx!.differentiators as string[]).join('; ')}.` : '';
    const goalStr = Array.isArray(ctx?.primary_goals) && (ctx!.primary_goals as string[]).length > 0 ? `Primary goal: ${(ctx!.primary_goals as string[])[0]}.` : '';
    const audienceStr = ctx?.target_audience ? `Target audience: ${ctx.target_audience}.` : '';

    // Fetch brand kit (confirmed assets only, best-effort)
    let brandKitBlock = "";
    let brandKitWarning = "";
    try {
      const kit = await getClientBrandKit(supabase, task.client_id, true);
      const hasVoice = kit.voice.tone_descriptors.length > 0 || kit.voice.value_proposition || kit.voice.messaging_pillars.length > 0;
      if (hasVoice) {
        brandKitBlock = "\n\n" + brandKitToPromptBlock(kit);
      } else {
        brandKitWarning = "Brand kit not yet confirmed — content generated without brand context. Run Brand Asset extraction first.";
        console.warn(`[run-content-agent] No confirmed brand kit for client ${task.client_id}`);
      }
    } catch (e) {
      console.warn("[run-content-agent] Brand kit fetch failed (non-fatal):", e);
    }

    const prompt = `You are a marketing expert for ${client.business_name || "a business"}.
Business type: ${servicesStr}
${client.website_summary ? `Website summary: ${client.website_summary}` : ''}
${diffsStr}
${goalStr}
${audienceStr}
Tone: ${tone}
${brandKitBlock}

Write a ${contentType}.
Topic: ${topic}
Keep it under 150 words. Make it engaging and ready to post.`;

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not configured");
    }

    const aiResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 800,
          temperature: 0.7,
          messages: [
            {
              role: "system",
              content: "You are a professional marketing copywriter. Write concise, engaging content ready to publish. Return only the content — no intro, no commentary, no quotes.",
            },
            { role: "user", content: prompt },
          ],
        }),
      }
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);

      if (aiResponse.status === 429) {
        throw new Error("Rate limit exceeded. Please try again later.");
      }
      if (aiResponse.status === 402) {
        throw new Error("AI credits exhausted. Please add funds.");
      }
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const generatedContent =
      aiData.choices?.[0]?.message?.content || "No content generated";

    const generatedAt = new Date().toISOString();

    // Save result and mark completed
    await supabase
      .from("workflow_tasks")
      .update({
        status: "completed",
        result: {
          content: generatedContent,
          content_type: contentType,
          topic: topic,
          generated_at: generatedAt,
          ...(brandKitWarning ? { brand_kit_warning: brandKitWarning } : {}),
        },
      })
      .eq("id", taskId);

    const contentTitle = `${contentType}: ${topic}`;
    const platform = payload.platform || null;
    const mediaUrls = Array.isArray(payload.media_urls) ? payload.media_urls : [];

    // Store the generated asset first so approvals/calendar can reference one canonical content record.
    const { data: generatedRecord, error: generatedInsertError } = await supabase
      .from("generated_content")
      .insert({
        client_id: task.client_id,
        content_type: contentType,
        title: contentTitle,
        content: generatedContent,
        metadata: {
          source: "run-content-agent",
          task_id: taskId,
          topic,
          platform,
          media_urls: mediaUrls,
        },
      })
      .select("id")
      .single();

    if (generatedInsertError) {
      console.error("Failed to insert generated_content row:", generatedInsertError);
      await supabase.from("automation_alerts").insert({
        alert_type: "data_error",
        severity: "warning",
        title: "generated_content insert failed in run-content-agent",
        message: generatedInsertError.message,
        source: "run-content-agent",
        metadata: { task_id: taskId, client_id: task.client_id, timestamp: generatedAt },
      }).catch(() => {});
    }

    // Notify admin that content needs review before client sees it.
    await supabase.from("activity_feed").insert({
      client_account_id: task.client_id,
      activity_type: "content_draft_ready",
      title: `Content draft ready for admin review: ${contentTitle}`,
      description: `${contentType} has been generated and is awaiting admin review.`,
      icon: "file-text",
      metadata: {
        task_id: taskId,
        content_id: generatedRecord?.id || null,
        platform,
      },
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        task_id: taskId,
        status: "completed",
        result: generatedContent,
        content_id: generatedRecord?.id || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("run-content-agent error:", e);

    await supabase.from('automation_alerts').insert({
      alert_type: 'function_error',
      severity: 'error',
      title: `Error in run-content-agent`,
      message: e instanceof Error ? e.message : 'Unknown error',
      source: 'run-content-agent',
      metadata: {
        function_name: 'run-content-agent',
        client_id: null,
        error_message: e instanceof Error ? e.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
    });

    // Mark task as failed
    if (taskId) {
      await supabase
        .from("workflow_tasks")
        .update({
          status: "failed",
          result: { error: e instanceof Error ? e.message : "Unknown error" },
        })
        .eq("id", taskId);
    }

    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
