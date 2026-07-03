import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Receives Post for Me webhook events. Register in the PfM dashboard:
//   URL:    https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/postforme-webhook
//   Events: social.post.result.created
// Set the webhook's secret as PFM_WEBHOOK_SECRET so events can be verified.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

interface PostResult {
  id: string;
  social_account_id: string;
  post_id: string;
  success: boolean;
  error: Record<string, unknown> | null;
  platform_data?: { id?: string; url?: string } | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Verify the shared secret when configured. PfM includes the webhook's
    // secret with each delivery; accept it from header or query param.
    const expectedSecret = Deno.env.get("PFM_WEBHOOK_SECRET");
    if (expectedSecret) {
      const url = new URL(req.url);
      const provided =
        req.headers.get("x-webhook-secret") ??
        req.headers.get("x-postforme-secret") ??
        url.searchParams.get("secret");
      if (provided !== expectedSecret) {
        console.warn("postforme-webhook: secret mismatch — event rejected");
        return json({ error: "Unauthorized" }, 401);
      }
    }

    const event = await req.json();
    const eventType: string = event.type ?? event.event_type ?? "";
    const result: PostResult | undefined = event.data;

    if (eventType !== "social.post.result.created" || !result?.post_id) {
      // Not an event we act on — acknowledge so PfM doesn't retry
      return json({ received: true, ignored: true });
    }

    const { data: item } = await supabase
      .from("content_calendar")
      .select("id, status, metadata, client_account_id, platform")
      .eq("postforme_post_id", result.post_id)
      .maybeSingle();

    if (!item) {
      console.warn(`postforme-webhook: no content_calendar row for pfm post ${result.post_id}`);
      return json({ received: true, matched: false });
    }

    const meta = (item.metadata as Record<string, unknown>) || {};

    if (result.success) {
      await supabase
        .from("content_calendar")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          metadata: {
            ...meta,
            pfm_result_id: result.id,
            platform_post_id: result.platform_data?.id ?? null,
            platform_post_url: result.platform_data?.url ?? null,
            publish_confirmed_at: new Date().toISOString(),
          },
        })
        .eq("id", item.id);
      console.log(`Confirmed publish: calendar=${item.id} url=${result.platform_data?.url ?? "n/a"}`);
    } else {
      const errorMsg = result.error
        ? JSON.stringify(result.error).slice(0, 500)
        : "Platform rejected the post";
      await supabase
        .from("content_calendar")
        .update({
          status: "failed",
          metadata: { ...meta, pfm_result_id: result.id, error: errorMsg },
        })
        .eq("id", item.id);

      await supabase.from("automation_alerts").insert({
        alert_type: "content_publish_failure",
        severity: "error",
        title: `${item.platform} post failed on the platform`,
        message: `PfM accepted the post but the platform rejected it: ${errorMsg}`,
        source: "postforme-webhook",
        source_id: item.id,
        metadata: { client_account_id: item.client_account_id, pfm_post_id: result.post_id },
      });
      console.error(`Publish failed on platform: calendar=${item.id} error=${errorMsg}`);
    }

    return json({ received: true, matched: true, success: result.success });
  } catch (err) {
    console.error("postforme-webhook error:", err);
    // Return 200 so PfM doesn't endlessly retry malformed events
    return json({ received: true, error: err instanceof Error ? err.message : "unknown" });
  }
});
