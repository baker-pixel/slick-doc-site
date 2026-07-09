import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildSocialImagePrompt } from "../_shared/socialImagePrompt.ts";
import { generateGptImage, persistGeneratedImage } from "../_shared/gptImage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Only platforms that attach images today (kept in sync with
// postforme-publish-post's fallback and generate-social-images-batch).
const TARGET_PLATFORMS = ["instagram"];

// Generates images synchronously, a few at a time, instead of via OpenAI's
// Batch API. The batch approach (generate-social-images-batch +
// check-image-batches) is ~50% cheaper when it works, but repeatedly hit a
// WORKER_RESOURCE_LIMIT crash streaming batch output files on this runtime
// and made no reliable progress. This is the same per-image call
// generate-social-image already makes successfully elsewhere (the
// postforme-publish-post fallback, the admin Social Media Posts panel) --
// slower to fully drain a big backlog and slightly more expensive, but
// actually completes instead of getting stuck.
const MAX_PER_RUN = 5;

async function generateAndPersistImage(supabase: any, openaiKey: string, prompt: string, contentCalendarId: string, platform: string): Promise<string> {
  const base64 = await generateGptImage(openaiKey, prompt, platform);
  const fileName = `social/sync/${contentCalendarId}_${Date.now()}.png`;
  return persistGeneratedImage(supabase, base64, fileName);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const openaiKey = Deno.env.get("OPENAI_API_KEY");

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    // Internal cron-only endpoint (same posture as fill-scheduled-content /
    // publish-scheduled-content) -- no per-call auth to gate, the same as
    // generate-social-images-batch's original design intent.
    if (!openaiKey) {
      return json({ error: "OPENAI_API_KEY is not configured" }, 503);
    }

    // Only content actually sitting in a client's approval queue -- same
    // targeting as generate-social-images-batch, so no cycles spent on
    // orphaned content_calendar rows nobody will ever see.
    const { data: linkedApprovals, error: apprErr } = await supabase
      .from("content_approvals")
      .select("content_id")
      .in("platform", TARGET_PLATFORMS)
      .not("content_id", "is", null);

    if (apprErr) throw new Error(`Failed to fetch approvals needing images: ${apprErr.message}`);

    const approvalContentIds = [...new Set((linkedApprovals || []).map((a: any) => a.content_id))];
    if (approvalContentIds.length === 0) {
      return json({ filled: 0, message: "No approvals need images" });
    }

    const { data: slots, error: fetchErr } = await supabase
      .from("content_calendar")
      .select("id, client_account_id, title, content, platform, metadata")
      .in("content_id", approvalContentIds)
      .is("metadata->>image_url", null)
      .limit(MAX_PER_RUN);

    if (fetchErr) throw new Error(`Failed to fetch slots needing images: ${fetchErr.message}`);

    if (!slots || slots.length === 0) {
      return json({ filled: 0, message: "No slots need images" });
    }

    const clientIds = [...new Set(slots.map((s: any) => s.client_account_id))];
    const { data: clients } = await supabase
      .from("client_accounts")
      .select("id, business_name, industry, context_profile")
      .in("id", clientIds);
    const clientMap = Object.fromEntries((clients || []).map((c: any) => [c.id, c]));

    let filled = 0;
    const failures: { id: string; error: string }[] = [];

    for (const slot of slots) {
      const client = clientMap[slot.client_account_id];
      if (!client) continue;

      try {
        const prompt = buildSocialImagePrompt(client, { content: slot.content || "", title: slot.title, platform: slot.platform });
        const imageUrl = await generateAndPersistImage(supabase, openaiKey, prompt, slot.id, slot.platform);

        await supabase
          .from("content_calendar")
          .update({ metadata: { ...((slot as any).metadata || {}), image_url: imageUrl } })
          .eq("id", slot.id);

        filled++;
        console.log(`Filled image for slot ${slot.id} (${slot.platform})`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`Failed to fill image for slot ${slot.id}:`, msg);
        failures.push({ id: slot.id, error: msg });
      }
    }

    return json({ filled, attempted: slots.length, failures });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("sync-fill-missing-images error:", msg);

    try {
      await supabase.from("automation_alerts").insert({
        alert_type: "function_error",
        severity: "error",
        title: "sync-fill-missing-images failed",
        message: msg,
        source: "sync-fill-missing-images",
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch { /* best-effort */ }

    return json({ error: msg }, 500);
  }
});
