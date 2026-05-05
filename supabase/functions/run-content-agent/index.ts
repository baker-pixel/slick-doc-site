import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const prompt = `You are a marketing expert for ${client.business_name || "a business"}.
Business type: ${servicesStr}
${client.website_summary ? `Website summary: ${client.website_summary}` : ''}
${diffsStr}
${goalStr}
${audienceStr}
Tone: ${tone}

Write a ${contentType}.
Topic: ${topic}
Keep it under 150 words. Make it engaging and ready to post.`;

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    const aiResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 800,
          temperature: 0.7,
          messages: [{ role: "user", content: prompt }],
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
      aiData.content?.[0]?.text || "No content generated";

    // Save result and mark completed
    await supabase
      .from("workflow_tasks")
      .update({
        status: "completed",
        result: {
          content: generatedContent,
          content_type: contentType,
          topic: topic,
          generated_at: new Date().toISOString(),
        },
      })
      .eq("id", taskId);

    // Bridge: insert into content_approvals for client review
    const platform = payload.platform || null;
    const mediaUrls = payload.media_urls || [];
    const scheduledFor = payload.scheduled_for
      ? new Date(payload.scheduled_for).toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // default 24hrs from now

    const { error: approvalInsertError } = await supabase
      .from("content_approvals")
      .insert({
        client_account_id: task.client_id,
        content_type: contentType,
        platform: platform,
        scheduled_for: scheduledFor,
        title: `${contentType}: ${topic}`,
        content_preview: generatedContent.substring(0, 300),
        full_content: generatedContent,
        status: "pending",
        publish_status: "pending",
        submitted_at: new Date().toISOString(),
      });

    if (approvalInsertError) {
      console.error("Failed to insert content_approvals row:", approvalInsertError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        task_id: taskId,
        status: "completed",
        result: generatedContent,
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
