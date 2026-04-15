import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * fill-scheduled-content
 *
 * Finds content_calendar rows that still have placeholder content
 * (the "[Auto-generated placeholder" marker set by auto-schedule-content)
 * and calls run-content-agent to generate real copy for each one.
 *
 * Can be called:
 *   - With no body → processes ALL placeholder slots across all clients
 *   - With { client_id } → processes only that client's placeholders
 *   - With { limit } → cap how many items to process in one run (default 10)
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json().catch(() => ({}));
    const clientId: string | undefined = body.client_id;
    const limit: number = Math.min(body.limit || 10, 50);

    // Find placeholder slots — content starts with "[Auto-generated placeholder"
    let query = supabase
      .from("content_calendar")
      .select("id, client_account_id, title, content_type, platform, scheduled_for, metadata")
      .like("content", "[Auto-generated placeholder%")
      .in("status", ["scheduled", "draft"])
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

    const baseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const slot of slots) {
      try {
        // Map content_type → run-content-agent content_type
        const contentTypeMap: Record<string, string> = {
          social_post: "social_post",
          blog_post: "blog",
          email_copy: "email",
          ad_copy: "ad_copy",
        };
        const agentContentType = contentTypeMap[slot.content_type] || slot.content_type;

        // Call run-content-agent to generate real content
        const res = await fetch(`${baseUrl}/functions/v1/run-content-agent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            client_id: slot.client_account_id,
            content_type: agentContentType,
            platform: slot.platform,
            topic: slot.title,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`run-content-agent returned ${res.status}: ${errText.slice(0, 200)}`);
        }

        const agentResult = await res.json();

        // Extract generated content from the agent response
        const generatedContent =
          agentResult.content ||
          agentResult.generated_content ||
          agentResult.output?.content ||
          agentResult.data?.content ||
          null;

        const generatedTitle =
          agentResult.title ||
          agentResult.output?.title ||
          agentResult.data?.title ||
          null;

        if (!generatedContent) {
          throw new Error("run-content-agent returned no usable content field");
        }

        // Update the content_calendar row with generated content
        const updatePayload: Record<string, unknown> = {
          content: generatedContent,
          status: "draft", // Move to draft for client review
          metadata: {
            ...((slot.metadata as object) || {}),
            ai_generated: true,
            generated_at: new Date().toISOString(),
          },
        };

        if (generatedTitle) {
          updatePayload.title = generatedTitle;
        }

        const { error: updateErr } = await supabase
          .from("content_calendar")
          .update(updatePayload)
          .eq("id", slot.id);

        if (updateErr) throw new Error(`Failed to update slot: ${updateErr.message}`);

        // Create a content_approvals row so the client can review
        await supabase.from("content_approvals").insert({
          client_account_id: slot.client_account_id,
          content_type: slot.content_type === "blog_post" ? "blog" : slot.content_type === "social_post" ? "social" : slot.content_type,
          title: generatedTitle || slot.title,
          content: generatedContent,
          status: "pending",
          metadata: { content_calendar_id: slot.id, platform: slot.platform },
        }).then(({ error }) => {
          if (error) console.error(`Failed to create approval for slot ${slot.id}:`, error);
        });

        console.log(`Filled slot ${slot.id} (${slot.content_type} for ${slot.platform})`);
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
      const sbErr = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await sbErr.from("automation_alerts").insert({
        alert_type: "function_error",
        severity: "error",
        title: "Error in fill-scheduled-content",
        message: error instanceof Error ? error.message : "Unknown error",
        source: "fill-scheduled-content",
        metadata: {
          function_name: "fill-scheduled-content",
          error_message: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        },
      });
    } catch (_) {
      console.error("Failed to log alert");
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
