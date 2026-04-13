import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let clientId: string | undefined;
  let contentCalendarId: string | undefined;

  try {
    const body = await req.json();
    clientId = body.clientId;
    const { tasks, trigger, metadata } = body;
    contentCalendarId = metadata?.content_calendar_id;

    if (!clientId) {
      throw new Error("clientId is required");
    }

    const N8N_WEBHOOK_URL = Deno.env.get("N8N_WEBHOOK_URL");
    if (!N8N_WEBHOOK_URL) {
      console.error("N8N_WEBHOOK_URL not configured");

      if (contentCalendarId) {
        await supabase
          .from("content_calendar")
          .update({ status: "failed", metadata: { error_message: "N8N_WEBHOOK_URL not configured" } })
          .eq("id", contentCalendarId);
      }

      return new Response(
        JSON.stringify({ error: "N8N_WEBHOOK_URL not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Triggering N8N for client ${clientId}, trigger: ${trigger}, tasks: ${tasks?.length || 0}`);

    const taskIds = (tasks || []).map((t: { id: string }) => t.id).filter(Boolean);
    if (taskIds.length > 0) {
      const { error: updateError } = await supabase
        .from("client_tasks")
        .update({ status: "in_progress", started_at: new Date().toISOString() })
        .in("id", taskIds);

      if (updateError) {
        console.error("Failed to update task statuses:", updateError);
      }
    }

    const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/n8n-callback`;

    const n8nPayload = {
      client_id: clientId,
      tasks: tasks || [],
      trigger: trigger || "run_auto",
      metadata: metadata || {},
      callback_url: callbackUrl,
      callback_api_key: Deno.env.get("SUPABASE_ANON_KEY"),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let n8nResponse: Response;
    try {
      n8nResponse = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(n8nPayload),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      const msg = (fetchErr as Error).name === "AbortError"
        ? "N8N webhook request timed out (10s)"
        : `N8N fetch error: ${(fetchErr as Error).message}`;
      console.error(msg);

      if (contentCalendarId) {
        await supabase
          .from("content_calendar")
          .update({ status: "failed", metadata: { error_message: msg } })
          .eq("id", contentCalendarId);
      }
      if (taskIds.length > 0) {
        await supabase
          .from("client_tasks")
          .update({ status: "failed", notes: msg })
          .in("id", taskIds);
      }

      return new Response(
        JSON.stringify({ error: msg }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    clearTimeout(timeoutId);

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      const msg = `N8N webhook returned ${n8nResponse.status}: ${errorText}`;
      console.error(msg);

      if (contentCalendarId) {
        await supabase
          .from("content_calendar")
          .update({ status: "failed", metadata: { error_message: msg } })
          .eq("id", contentCalendarId);
      }
      if (taskIds.length > 0) {
        await supabase
          .from("client_tasks")
          .update({ status: "failed", notes: msg })
          .in("id", taskIds);
      }

      return new Response(
        JSON.stringify({ error: msg }),
        { status: n8nResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (contentCalendarId) {
      await supabase
        .from("content_calendar")
        .update({ status: "processing" })
        .eq("id", contentCalendarId);
    }

    let n8nData = null;
    try {
      n8nData = await n8nResponse.json();
    } catch {
      // N8N may return non-JSON
    }

    console.log("N8N webhook triggered successfully");

    return new Response(
      JSON.stringify({
        success: true,
        message: `Triggered N8N for ${taskIds.length} tasks`,
        taskIds,
        n8nResponse: n8nData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("trigger-n8n error:", error);

    await supabase.from("automation_alerts").insert({
      alert_type: "function_error",
      severity: "error",
      title: "Error in trigger-n8n",
      message: error instanceof Error ? error.message : "Unknown error",
      source: "trigger-n8n",
      source_id: clientId ?? undefined,
      metadata: {
        function_name: "trigger-n8n",
        client_id: clientId ?? null,
        error_message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
    });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
