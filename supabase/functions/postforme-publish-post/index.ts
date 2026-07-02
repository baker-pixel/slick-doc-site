import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PFM_API = "https://api.postforme.dev";

const CHAR_LIMITS: Record<string, number> = {
  twitter: 270,
  instagram: 2200,
  linkedin: 2900,
  facebook: 63000,
};

function enforceCharLimit(content: string, platform: string): string {
  const limit = CHAR_LIMITS[platform];
  if (!limit || content.length <= limit) return content;
  const truncated = content.slice(0, limit - 3);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > limit * 0.8 ? truncated.slice(0, lastSpace) : truncated) + "…";
}

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    lastResponse = res;
    if (attempt === maxRetries) break;
    const retryAfterSec = parseInt(res.headers.get("Retry-After") || "2", 10);
    const backoffMs = Math.max(retryAfterSec * 1000, 1000 * Math.pow(2, attempt));
    console.warn(`PfM rate limited. Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`);
    await new Promise((r) => setTimeout(r, backoffMs));
  }
  return lastResponse!;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const pfmApiKey = Deno.env.get("POSTFORME_API_KEY");

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Track whether we've claimed the row (set status=processing).
  // If an unexpected exception fires after claiming, the finally/catch resets it.
  let claimed = false;
  let contentCalendarId = "";
  let existingMeta: object = {};

  const markFailed = async (id: string, meta: object, errorMsg: string) => {
    claimed = false; // we're handling it — no reset needed
    await supabase
      .from("content_calendar")
      .update({ status: "failed", metadata: { ...meta, error: errorMsg } })
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

  const markPublished = async (id: string, meta: object, pfmPostId: string, charsLen: number) => {
    claimed = false; // we're handling it — no reset needed
    await supabase
      .from("content_calendar")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        postforme_post_id: pfmPostId,
        metadata: { ...meta, pfm_post_id: pfmPostId, chars_sent: charsLen },
      })
      .eq("id", id);
  };

  try {
    if (!pfmApiKey) return json({ error: "POSTFORME_API_KEY not configured", success: false }, 500);

    const body = await req.json();
    contentCalendarId = body.contentCalendarId;
    if (!contentCalendarId) return json({ error: "contentCalendarId is required", success: false }, 400);

    // Read the item
    const { data: item, error: itemErr } = await supabase
      .from("content_calendar")
      .select("*")
      .eq("id", contentCalendarId)
      .single();

    if (itemErr || !item) return json({ error: "Content calendar row not found", success: false }, 404);

    // Only skip if already published — allow scheduled, draft, processing
    if (item.status === "published") {
      console.log(`Skipping ${contentCalendarId} — already published`);
      return json({ success: true, skipped: true, reason: "already_published" });
    }

    existingMeta = (item.metadata as object) || {};

    // Atomic claim: mark as processing only if not already published.
    // Returns the row count so we can detect races.
    const { data: claimedRows, error: lockErr } = await supabase
      .from("content_calendar")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", contentCalendarId)
      .neq("status", "published")
      .select("id");

    if (lockErr) {
      console.error("Lock error:", lockErr.message);
      return json({ error: "Failed to acquire lock", success: false }, 409);
    }
    if (!claimedRows || claimedRows.length === 0) {
      // Another concurrent call won the race and published it
      return json({ success: true, skipped: true, reason: "already_published" });
    }

    claimed = true; // we now own this row

    // Look up PfM account for this client + platform
    const { data: pfmAccount } = await supabase
      .from("client_postforme_accounts")
      .select("postforme_account_id, username, platform")
      .eq("client_id", item.client_account_id)
      .eq("platform", item.platform)
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();

    if (!pfmAccount) {
      await markFailed(
        contentCalendarId,
        existingMeta,
        `No Post for Me account connected for "${item.platform}". Connect one in Social & Accounts.`,
      );
      return json({ error: `No PfM account for ${item.platform}`, success: false }, 422);
    }

    const caption = enforceCharLimit(item.content || "", item.platform);

    if (item.platform === "twitter" && caption.length > 280) {
      await markFailed(contentCalendarId, existingMeta, `Tweet too long after truncation (${caption.length} chars).`);
      return json({ error: "Tweet too long", success: false }, 422);
    }

    const postBody: Record<string, unknown> = {
      caption,
      social_accounts: [pfmAccount.postforme_account_id],
    };

    // Only pass scheduled_at if the time is still in the future
    if (item.scheduled_for && new Date(item.scheduled_for) > new Date()) {
      postBody.scheduled_at = new Date(item.scheduled_for).toISOString();
    }

    // Auto-generate image for Instagram if none exists
    let imageUrl = (item.metadata as { image_url?: string } | null)?.image_url ?? null;
    if (!imageUrl && item.platform === "instagram") {
      const { data: clientRow } = await supabase
        .from("client_accounts")
        .select("business_name")
        .eq("id", item.client_account_id)
        .single();

      const imgRes = await supabase.functions.invoke("generate-social-image", {
        body: { caption: item.content || "", businessName: clientRow?.business_name || "", platform: "instagram", contentCalendarId },
      });
      if (!imgRes.error && !imgRes.data?.error) {
        imageUrl = imgRes.data?.imageUrl ?? null;
      } else {
        console.warn(`Image generation failed for ${contentCalendarId}: ${imgRes.data?.error || imgRes.error?.message}`);
      }
    }

    if (imageUrl) postBody.media = [{ url: imageUrl }];

    console.log(`Publishing to PfM: account=${pfmAccount.postforme_account_id} platform=${item.platform} chars=${caption.length} image=${!!imageUrl}`);

    const pfmRes = await fetchWithRetry(
      `${PFM_API}/v1/social-posts`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${pfmApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(postBody),
      },
      3,
    );

    if (!pfmRes.ok) {
      const text = await pfmRes.text();
      let friendlyErr = `PfM API error ${pfmRes.status}`;
      try { friendlyErr = JSON.parse(text)?.message || friendlyErr; } catch { /* ignore */ }
      console.error("PfM publish error:", pfmRes.status, text);
      await markFailed(contentCalendarId, existingMeta, friendlyErr);
      return json({ error: friendlyErr, success: false }, 502);
    }

    const pfmPost = await pfmRes.json();
    await markPublished(contentCalendarId, existingMeta, pfmPost.id, caption.length);
    console.log(`Published: pfm_post_id=${pfmPost.id}`);
    return json({ success: true, postforme_post_id: pfmPost.id });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("postforme-publish-post unhandled error:", msg);

    // If we claimed the row but crashed before calling markFailed/markPublished,
    // reset to "scheduled" so the cron can retry rather than leaving it stuck.
    if (claimed && contentCalendarId) {
      await supabase
        .from("content_calendar")
        .update({ status: "scheduled", updated_at: new Date().toISOString() })
        .eq("id", contentCalendarId)
        .eq("status", "processing");
    }

    return json({ error: msg, success: false }, 500);
  }
});
