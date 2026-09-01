import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildSocialImagePrompt } from "../_shared/socialImagePrompt.ts";
import { generateGptImage, persistGeneratedImage } from "../_shared/gptImage.ts";
import { checkAdminAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Only platforms that attach images today (kept in sync with
// postforme-publish-post's fallback and generate-social-images-batch).
const TARGET_PLATFORMS = ["instagram"];

// Fallback for slots the OpenAI Batch API path (generate-social-images-batch
// + check-image-batches, submitted daily from fill-scheduled-content) hasn't
// covered. Only fires for a slot when the batch attempt isn't going to save
// it in time -- see isFallbackEligible -- so the cheaper batch path (~50%
// less expensive) gets its full window instead of every slot racing straight
// to this synchronous, slightly pricier path. This is the same per-image
// call generate-social-image already makes elsewhere (postforme-publish-post's
// last-resort fallback, the admin Social Media Posts panel).
const MAX_PER_RUN = 5;
// Cap for an admin-triggered, single-client, forced run (see client_id/force
// below) -- higher than the cron's MAX_PER_RUN since it's bounded to one
// client's backlog instead of racing every client's slots for a shared quota.
const ADMIN_MAX_PER_RUN = 20;
// How long a batch-covered slot is left alone before this fallback overrides
// it regardless of batch status -- a hard guarantee that no post ever goes
// out with no image, even if OpenAI's batch is still "in_progress" this late.
const URGENT_WINDOW_MS = 4 * 60 * 60 * 1000;
// Candidate pool fetched before the eligibility filter below narrows it down
// to MAX_PER_RUN -- most batch-covered slots will be filtered back out, so
// this needs enough headroom that a run doesn't go empty while a real
// fallback candidate sits just past the query's limit.
const CANDIDATE_POOL_SIZE = 50;

function isFallbackEligible(slot: { metadata: unknown; scheduled_for: string | null }): boolean {
  const meta = (slot.metadata as Record<string, unknown>) || {};
  if (!meta.image_batch_id) return true; // never entered a batch -- don't wait on one
  if (meta.image_batch_status === "failed") return true; // this slot's batch attempt failed
  if (slot.scheduled_for && new Date(slot.scheduled_for).getTime() - Date.now() <= URGENT_WINDOW_MS) return true; // deadline safety net
  return false; // still within the batch's window -- leave it alone
}

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
    const body = await req.json().catch(() => ({}));
    const clientId: string | undefined = body.client_id;
    // Explicit admin action ("generate images now" for one client) --
    // bypasses the batch-window wait since there's no cron cadence to
    // protect here, just this one client's backlog.
    const force: boolean = !!body.force;

    // Internal cron-only endpoint by default (same posture as
    // fill-scheduled-content / publish-scheduled-content) -- no auth to gate
    // when called with no client_id, same as generate-social-images-batch's
    // original design intent. A client_id turns this into an admin-facing
    // action, so it needs the same admin auth those get.
    if (clientId) {
      const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
      const isServer = bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!isServer) {
        const auth = await checkAdminAuth(req, supabase, body.password);
        if (!auth.authorized) return json({ error: "Unauthorized" }, 401);
      }
    }

    if (!openaiKey) {
      return json({ error: "OPENAI_API_KEY is not configured" }, 503);
    }

    // Only content actually sitting in a client's approval queue -- same
    // targeting as generate-social-images-batch, so no cycles spent on
    // orphaned content_calendar rows nobody will ever see.
    let approvalsQuery = supabase
      .from("content_approvals")
      .select("content_id")
      .in("platform", TARGET_PLATFORMS)
      .not("content_id", "is", null);
    if (clientId) approvalsQuery = approvalsQuery.eq("client_account_id", clientId);

    const { data: linkedApprovals, error: apprErr } = await approvalsQuery;

    if (apprErr) throw new Error(`Failed to fetch approvals needing images: ${apprErr.message}`);

    const approvalContentIds = [...new Set((linkedApprovals || []).map((a: any) => a.content_id))];
    if (approvalContentIds.length === 0) {
      return json({ filled: 0, message: "No approvals need images" });
    }

    let candidatesQuery = supabase
      .from("content_calendar")
      .select("id, client_account_id, title, content, platform, metadata, scheduled_for")
      .in("content_id", approvalContentIds)
      .is("metadata->>image_url", null)
      .limit(clientId ? ADMIN_MAX_PER_RUN : CANDIDATE_POOL_SIZE);
    if (clientId) candidatesQuery = candidatesQuery.eq("client_account_id", clientId);

    const { data: candidates, error: fetchErr } = await candidatesQuery;

    if (fetchErr) throw new Error(`Failed to fetch slots needing images: ${fetchErr.message}`);

    if (!candidates || candidates.length === 0) {
      return json({ filled: 0, message: "No slots need images" });
    }

    const runCap = clientId ? ADMIN_MAX_PER_RUN : MAX_PER_RUN;
    const slots = (force ? candidates : candidates.filter(isFallbackEligible)).slice(0, runCap);

    if (slots.length === 0) {
      return json({ filled: 0, message: "No slots need fallback yet (batch still within its window)" });
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
