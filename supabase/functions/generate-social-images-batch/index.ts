import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkAdminAuth } from "../_shared/auth.ts";
import { buildSocialImagePrompt, imageQualityForPlatform, imageSizeForPlatform } from "../_shared/socialImagePrompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API = "https://api.openai.com/v1";

// Only platforms that actually attach images today (kept in sync with the
// synchronous fallback in postforme-publish-post). Extend here if other
// platforms start getting images too.
const BATCH_PLATFORMS = ["instagram"];

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

    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const isServer = bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!isServer) {
      const auth = await checkAdminAuth(req, supabase, body.password);
      if (!auth.authorized) return json({ error: "Unauthorized" }, 401);
    }

    if (!openaiKey) {
      return json({ error: "OPENAI_API_KEY is not configured. Add it via: supabase secrets set OPENAI_API_KEY=sk-..." }, 503);
    }

    // Only generate images for content actually sitting in (or headed to)
    // the client's approval queue -- not just any content_calendar row
    // missing an image. Plenty of older rows predate content_id ever being
    // linked and have no approval tied to them at all; generating images
    // for those wastes the batch on posts the client will never see.
    const { data: linkedApprovals, error: apprErr } = await supabase
      .from("content_approvals")
      .select("content_id")
      .in("platform", BATCH_PLATFORMS)
      .not("content_id", "is", null);

    if (apprErr) throw new Error(`Failed to fetch approvals needing images: ${apprErr.message}`);

    const approvalContentIds = [...new Set((linkedApprovals || []).map((a: any) => a.content_id))];

    if (approvalContentIds.length === 0) {
      return json({ submitted: 0, message: "No approvals need images" });
    }

    // Kept small (not OpenAI's 50k/batch limit) because check-image-batches
    // can only safely apply a handful of results per invocation on this
    // runtime (see its MAX_APPLY_PER_RUN comment) -- a small, frequent batch
    // drains fast; a huge one takes many hours to fully apply.
    const { data: slots, error: fetchErr } = await supabase
      .from("content_calendar")
      .select("id, client_account_id, title, content, platform, metadata")
      .in("content_id", approvalContentIds)
      .is("metadata->>image_url", null)
      .is("metadata->>image_batch_id", null)
      .limit(20);

    if (fetchErr) throw new Error(`Failed to fetch slots needing images: ${fetchErr.message}`);

    if (!slots || slots.length === 0) {
      return json({ submitted: 0, message: "No slots need images" });
    }

    const clientIds = [...new Set(slots.map((s: any) => s.client_account_id))];
    const { data: clients } = await supabase
      .from("client_accounts")
      .select("id, business_name, industry, context_profile")
      .in("id", clientIds);
    const clientMap = Object.fromEntries((clients || []).map((c: any) => [c.id, c]));

    const jsonlLines: string[] = [];
    const includedSlotIds: string[] = [];

    for (const slot of slots) {
      const client = clientMap[slot.client_account_id];
      if (!client) continue;

      const prompt = buildSocialImagePrompt(client, { content: slot.content || "", title: slot.title, platform: slot.platform });

      jsonlLines.push(JSON.stringify({
        custom_id: slot.id,
        method: "POST",
        url: "/v1/images/generations",
        body: { model: "gpt-image-1", prompt, n: 1, size: imageSizeForPlatform(slot.platform), quality: imageQualityForPlatform(slot.platform) },
      }));
      includedSlotIds.push(slot.id);
    }

    if (jsonlLines.length === 0) {
      return json({ submitted: 0, message: "No eligible slots (no matching client found)" });
    }

    // 1. Upload the batch input file
    const jsonlBlob = new Blob([jsonlLines.join("\n")], { type: "application/jsonl" });
    const uploadForm = new FormData();
    uploadForm.append("purpose", "batch");
    uploadForm.append("file", jsonlBlob, "social-images-batch.jsonl");

    const fileRes = await fetch(`${OPENAI_API}/files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: uploadForm,
    });

    if (!fileRes.ok) {
      const errText = await fileRes.text();
      throw new Error(`OpenAI file upload failed (${fileRes.status}): ${errText.slice(0, 300)}`);
    }

    const fileData = await fileRes.json();
    const inputFileId: string = fileData.id;

    // 2. Create the batch job
    const batchRes = await fetch(`${OPENAI_API}/batches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        input_file_id: inputFileId,
        endpoint: "/v1/images/generations",
        completion_window: "24h",
        metadata: { source: "generate-social-images-batch", item_count: String(includedSlotIds.length) },
      }),
    });

    if (!batchRes.ok) {
      const errText = await batchRes.text();
      throw new Error(`OpenAI batch creation failed (${batchRes.status}): ${errText.slice(0, 300)}`);
    }

    const batch = await batchRes.json();

    // 3. Record the batch and stamp every included slot with its batch id
    const { error: jobInsertErr } = await supabase.from("image_batch_jobs").insert({
      openai_batch_id: batch.id,
      status: batch.status || "submitted",
      input_file_id: inputFileId,
      item_count: includedSlotIds.length,
    });
    if (jobInsertErr) console.error("Failed to record image_batch_jobs row:", jobInsertErr.message);

    for (const slot of slots) {
      if (!includedSlotIds.includes(slot.id)) continue;
      // image_batch_status intentionally left unset here -- check-image-batches
      // treats "no status yet" and "any non-terminal status" the same way
      // (still pending), only "completed"/"failed" mean done.
      await supabase
        .from("content_calendar")
        .update({
          metadata: {
            ...((slot as any).metadata || {}),
            image_batch_id: batch.id,
          },
        })
        .eq("id", slot.id);
    }

    console.log(`Submitted image batch ${batch.id} with ${includedSlotIds.length} items`);
    return json({ submitted: includedSlotIds.length, batch_id: batch.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("generate-social-images-batch error:", msg);

    try {
      await supabase.from("automation_alerts").insert({
        alert_type: "function_error",
        severity: "error",
        title: "generate-social-images-batch failed",
        message: msg,
        source: "generate-social-images-batch",
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch { /* best-effort */ }

    return json({ error: msg }, 500);
  }
});
