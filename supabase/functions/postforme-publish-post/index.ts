import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PFM_API = "https://api.postforme.dev";

// Hard character limits per platform. Twitter is the critical one (280 chars total).
// Leave a small safety buffer on each.
const CHAR_LIMITS: Record<string, number> = {
  twitter: 270,      // 280 hard limit, 10-char buffer
  instagram: 2200,
  linkedin: 2900,    // 3000 hard limit, 100-char buffer
  facebook: 63000,
};

function enforceCharLimit(content: string, platform: string): string {
  const limit = CHAR_LIMITS[platform];
  if (!limit || content.length <= limit) return content;

  // Truncate at a word boundary and add ellipsis
  const truncated = content.slice(0, limit - 3);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > limit * 0.8 ? truncated.slice(0, lastSpace) : truncated) + "…";
}

// Retry fetch with exponential backoff; respects PfM's Retry-After header on 429.
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);

    if (res.status !== 429) return res;

    lastResponse = res;
    if (attempt === maxRetries) break;

    const retryAfterSec = parseInt(res.headers.get("Retry-After") || "2", 10);
    const backoffMs = Math.max(retryAfterSec * 1000, 1000 * Math.pow(2, attempt));
    console.warn(`PfM rate limited (429). Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`);
    await new Promise((r) => setTimeout(r, backoffMs));
  }

  return lastResponse!;
}

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
      .update({ status: "failed", metadata: { ...existingMeta, error: errorMsg } })
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

    // Guard: skip if already published or being processed (prevents double-publish)
    if (item.status === "published" || item.status === "processing") {
      console.log(`Skipping ${contentCalendarId} — status is already "${item.status}"`);
      return json({ success: true, skipped: true, reason: item.status });
    }

    const existingMeta = (item.metadata as object) || {};

    // Lock the row so concurrent cron runs can't double-publish
    const { error: lockErr } = await supabase
      .from("content_calendar")
      .update({ status: "processing" })
      .eq("id", contentCalendarId)
      .eq("status", "scheduled"); // only lock if still scheduled (optimistic lock)

    if (lockErr) {
      console.error("Failed to acquire processing lock:", lockErr.message);
      return json({ error: "Failed to acquire lock", success: false }, 409);
    }

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
      const errMsg = `No Post for Me account connected for "${item.platform}". Connect one in Social & Accounts.`;
      console.error(errMsg);
      await markFailed(contentCalendarId, existingMeta, errMsg);
      return json({ error: errMsg, success: false }, 422);
    }

    // Enforce platform character limits before sending to PfM
    const caption = enforceCharLimit(item.content || "", item.platform);

    if (item.platform === "twitter" && caption.length > 280) {
      const errMsg = `Tweet content exceeds 280 chars after truncation (${caption.length} chars). Content generation error.`;
      await markFailed(contentCalendarId, existingMeta, errMsg);
      return json({ error: errMsg, success: false }, 422);
    }

    // Build the Post for Me post body
    const postBody: Record<string, unknown> = {
      caption,
      social_accounts: [pfmAccount.postforme_account_id],
    };

    // Only schedule if the time is still in the future
    if (item.scheduled_for) {
      const scheduledDate = new Date(item.scheduled_for);
      if (scheduledDate > new Date()) {
        postBody.scheduled_at = scheduledDate.toISOString();
      }
    }

    // Resolve media URL — auto-generate for image-required platforms (Instagram, Threads)
    let imageUrl = (item.metadata as { image_url?: string } | null)?.image_url ?? null;
    const IMAGE_REQUIRED_PLATFORMS = ["instagram"];

    if (!imageUrl && IMAGE_REQUIRED_PLATFORMS.includes(item.platform)) {
      console.log(`No image for ${item.platform} post ${contentCalendarId} — auto-generating...`);

      // Fetch business name for the image prompt
      const { data: clientRow } = await supabase
        .from("client_accounts")
        .select("business_name")
        .eq("id", item.client_account_id)
        .single();

      const imgRes = await supabase.functions.invoke("generate-social-image", {
        body: {
          caption: item.content || "",
          businessName: clientRow?.business_name || "the business",
          platform: item.platform,
          contentCalendarId,
        },
      });

      if (imgRes.error || imgRes.data?.error) {
        const errMsg = imgRes.data?.error || imgRes.error?.message || "Image generation failed";
        console.warn(`Image generation failed for ${contentCalendarId}: ${errMsg}. Publishing without image.`);
        // Don't hard-fail — attempt to publish without image (PfM may accept it)
      } else {
        imageUrl = imgRes.data?.imageUrl ?? null;
        console.log(`Image generated: ${imageUrl}`);
      }
    }

    if (imageUrl) {
      postBody.media = [{ url: imageUrl }];
    }

    console.log(
      `Publishing to PfM: account=${pfmAccount.postforme_account_id} platform=${item.platform} chars=${caption.length} hasImage=${!!imageUrl} calendarId=${contentCalendarId}`,
    );

    // Call PfM with retry logic for rate limits
    const pfmRes = await fetchWithRetry(
      `${PFM_API}/v1/social-posts`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pfmApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(postBody),
      },
      3,
    );

    if (!pfmRes.ok) {
      const text = await pfmRes.text();
      let friendlyErr = `PfM API error ${pfmRes.status}`;
      try {
        const parsed = JSON.parse(text);
        friendlyErr = parsed.message || parsed.error || friendlyErr;
      } catch { /* ignore */ }
      console.error("PfM publish error:", pfmRes.status, text);
      await markFailed(contentCalendarId, existingMeta, friendlyErr);
      return json({ error: friendlyErr, success: false }, 502);
    }

    const pfmPost = await pfmRes.json();

    // Mark as published
    await supabase
      .from("content_calendar")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        postforme_post_id: pfmPost.id,
        metadata: { ...existingMeta, pfm_post_id: pfmPost.id, chars_sent: caption.length },
      })
      .eq("id", contentCalendarId);

    console.log(`Published via PfM: pfm_post_id=${pfmPost.id} chars=${caption.length}`);
    return json({ success: true, postforme_post_id: pfmPost.id });
  } catch (err: unknown) {
    console.error("postforme-publish-post error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json({ error: msg, success: false }, 500);
  }
});
