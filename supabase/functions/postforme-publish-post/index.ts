import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PFM_API = "https://api.postforme.dev";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const pfmApiKey = Deno.env.get("POSTFORME_API_KEY");

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const markFailed = async (id: string, existingMeta: object, errorMsg: string) => {
    await supabase
      .from("content_calendar")
      .update({
        status: "failed",
        metadata: { ...existingMeta, error: errorMsg },
      })
      .eq("id", id);

    await supabase.from("automation_alerts").insert({
      alert_type: "content_publish_failure",
      severity: "error",
      title: "Post for Me Publish Failed",
      message: errorMsg,
      source: "postforme-publish-post",
      source_id: id,
    });
  };

  try {
    if (!pfmApiKey) {
      return json({ error: "POSTFORME_API_KEY not configured", success: false }, 500);
    }

    const { contentCalendarId } = await req.json();
    if (!contentCalendarId) {
      return json({ error: "contentCalendarId is required", success: false }, 400);
    }

    // Fetch the content calendar row
    const { data: item, error: itemErr } = await supabase
      .from("content_calendar")
      .select("*")
      .eq("id", contentCalendarId)
      .single();

    if (itemErr || !item) {
      return json({ error: "Content calendar row not found", success: false }, 404);
    }

    const existingMeta = (item.metadata as object) || {};

    // Look up connected Post for Me account for this client + platform
    const { data: pfmAccount, error: accountErr } = await supabase
      .from("client_postforme_accounts")
      .select("postforme_account_id, username, platform")
      .eq("client_id", item.client_account_id)
      .eq("platform", item.platform)
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();

    if (accountErr || !pfmAccount) {
      const errMsg = `No Post for Me account connected for platform "${item.platform}". Connect one in Social Media > Accounts.`;
      console.error(errMsg);
      await markFailed(contentCalendarId, existingMeta, errMsg);
      return json({ error: errMsg, success: false }, 422);
    }

    // Build the Post for Me post body
    const postBody: Record<string, unknown> = {
      caption: item.content,
      social_accounts: [pfmAccount.postforme_account_id],
    };

    // Only set scheduled_at if it's in the future
    if (item.scheduled_for) {
      const scheduledDate = new Date(item.scheduled_for);
      if (scheduledDate > new Date()) {
        postBody.scheduled_at = scheduledDate.toISOString();
      }
    }

    // Attach media if present
    const imageUrl = (item.metadata as { image_url?: string } | null)?.image_url;
    if (imageUrl) {
      postBody.media = [{ url: imageUrl }];
    }

    console.log(`Publishing to PfM: account=${pfmAccount.postforme_account_id} platform=${item.platform} calendarId=${contentCalendarId}`);

    // Create post via Post for Me
    const pfmRes = await fetch(`${PFM_API}/v1/social-posts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pfmApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(postBody),
    });

    if (!pfmRes.ok) {
      const text = await pfmRes.text();
      const errMsg = `Post for Me API error ${pfmRes.status}: ${text}`;
      console.error(errMsg);
      await markFailed(contentCalendarId, existingMeta, errMsg);
      return json({ error: errMsg, success: false }, 502);
    }

    const pfmPost = await pfmRes.json();

    // Mark as published
    await supabase
      .from("content_calendar")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        postforme_post_id: pfmPost.id,
        metadata: { ...existingMeta, pfm_post_id: pfmPost.id },
      })
      .eq("id", contentCalendarId);

    console.log(`Published via PfM: pfm_post_id=${pfmPost.id}`);

    return json({ success: true, postforme_post_id: pfmPost.id });
  } catch (err: unknown) {
    console.error("postforme-publish-post error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json({ error: msg, success: false }, 500);
  }
});
