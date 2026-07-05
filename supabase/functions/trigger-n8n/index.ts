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
    // advance-workflow (and possibly other callers) send snake_case; accept both.
    clientId = body.clientId ?? body.client_id;
    const { tasks, trigger, metadata, workflow_id, step_id, step_number, task_type } = body;
    contentCalendarId = metadata?.content_calendar_id;

    if (!clientId) {
      throw new Error("clientId is required");
    }

    // This function forwards client OAuth tokens to n8n — server/admin only.
    // Callers: advance-workflow, publish/fill-scheduled-content
    // (service key bearer) and the admin panel (ADMIN_PASSWORD in body).
    const bearer = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
    const isServer = bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    const isAdminCall = !!adminPassword && body.password === adminPassword;
    if (!isServer && !isAdminCall) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const N8N_WEBHOOK_URL = Deno.env.get("N8N_WEBHOOK_URL_PROD");
    if (!N8N_WEBHOOK_URL) {
      console.error("N8N_WEBHOOK_URL_PROD not configured");

      if (contentCalendarId) {
        await supabase
          .from("content_calendar")
          .update({ status: "failed", metadata: { error_message: "N8N_WEBHOOK_URL_PROD not configured" } })
          .eq("id", contentCalendarId);
      }

      return new Response(
        JSON.stringify({ error: "N8N_WEBHOOK_URL_PROD not configured" }),
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

    // For social publish triggers, fetch the OAuth token and build enriched payload
    const isSocialPublish = trigger === "publish_social" && metadata?.platform;
    let n8nPayload: Record<string, unknown>;

    if (isSocialPublish) {
      const platform = metadata.platform as string;

      const { data: tokenRow, error: tokenErr } = await supabase
        .from("client_oauth_tokens")
        .select("access_token, page_id")
        .eq("client_id", clientId)
        .eq("platform", platform)
        .maybeSingle();

      if (tokenErr) {
        console.error("Error fetching OAuth token:", tokenErr);
      }

      if (!tokenRow) {
        const msg = `No OAuth token found for ${platform}`;
        console.error(msg);

        if (contentCalendarId) {
          await supabase
            .from("content_calendar")
            .update({ status: "failed", metadata: { ...((metadata as object) || {}), error_message: msg } })
            .eq("id", contentCalendarId);
        }

        return new Response(
          JSON.stringify({ error: msg }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      n8nPayload = {
        content_id: contentCalendarId || null,
        client_id: clientId,
        platform,
        content: metadata.content || "",
        media_url: metadata.media_url || null,
        scheduled_at: metadata.scheduled_for || null,
        access_token: tokenRow.access_token,
        page_id: tokenRow.page_id || null,
        callback_url: callbackUrl,
      };
    } else {
      n8nPayload = {
        client_id: clientId,
        tasks: tasks || [],
        trigger: trigger || task_type || "run_auto",
        metadata: metadata || {},
        // Workflow-step identifiers so n8n can echo them back in its callback
        // and advance-workflow can unlock the next step. Previously dropped
        // silently — n8n_post_social/n8n_post_blog steps from advance-workflow
        // had no way to close the loop.
        ...(workflow_id ? { workflow_id } : {}),
        ...(step_id ? { step_id } : {}),
        ...(step_number != null ? { step_number } : {}),
        ...(task_type ? { task_type } : {}),
        callback_url: callbackUrl,
        callback_api_key: Deno.env.get("SUPABASE_PUBLISHABLE_KEY"),
      };
    }

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
