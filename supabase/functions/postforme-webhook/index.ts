import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyPfmResult, type PfmPostResult } from "../_shared/pfmResult.ts";

// Receives Post for Me webhook events. Register in the PfM dashboard:
//   URL:    https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/postforme-webhook
//   Events: social.post.result.created
// PfM generates the secret when the webhook is created (returned in the
// response / shown in the dashboard) and sends it on every delivery in the
// "Post-For-Me-Webhook-Secret" header. Store it as PFM_WEBHOOK_SECRET.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret, post-for-me-webhook-secret",
};

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
        req.headers.get("post-for-me-webhook-secret") ??
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
    const result: PfmPostResult | undefined = event.data;

    if (eventType !== "social.post.result.created" || !result?.post_id) {
      // Not an event we act on — acknowledge so PfM doesn't retry
      return json({ received: true, ignored: true });
    }

    const { data: item } = await supabase
      .from("content_calendar")
      .select("id, status, metadata, client_account_id, platform, title")
      .eq("postforme_post_id", result.post_id)
      .maybeSingle();

    if (!item) {
      console.warn(`postforme-webhook: no content_calendar row for pfm post ${result.post_id}`);
      return json({ received: true, matched: false });
    }

    await applyPfmResult(supabase, item, result, "postforme-webhook");

    return json({ received: true, matched: true, success: result.success });
  } catch (err) {
    console.error("postforme-webhook error:", err);
    // Return 200 so PfM doesn't endlessly retry malformed events
    return json({ received: true, error: err instanceof Error ? err.message : "unknown" });
  }
});
