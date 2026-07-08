import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API = "https://api.openai.com/v1";
const TERMINAL_STATUSES = new Set(["completed", "failed", "expired", "cancelled"]);

interface BatchOutputLine {
  id: string;
  custom_id: string;
  response: { status_code: number; body?: { data?: Array<{ b64_json?: string }> } } | null;
  error: { code: string; message: string } | null;
}

async function persistBase64Image(supabase: any, base64: string, contentCalendarId: string): Promise<string> {
  const imageBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const fileName = `social/batch/${contentCalendarId}_${Date.now()}.png`;

  const { error: uploadErr } = await supabase.storage
    .from("generated-images")
    .upload(fileName, imageBytes, { contentType: "image/png", upsert: true });

  if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

  const { data: publicData } = supabase.storage.from("generated-images").getPublicUrl(fileName);
  return publicData.publicUrl;
}

async function applyResultLine(supabase: any, line: BatchOutputLine) {
  const contentCalendarId = line.custom_id;

  const { data: slot } = await supabase
    .from("content_calendar")
    .select("metadata")
    .eq("id", contentCalendarId)
    .maybeSingle();

  const existingMeta = (slot?.metadata as Record<string, unknown>) || {};

  if (line.error || !line.response || line.response.status_code !== 200) {
    console.warn(`Batch item failed for slot ${contentCalendarId}:`, line.error?.message || "no response");
    await supabase
      .from("content_calendar")
      .update({ metadata: { ...existingMeta, image_batch_status: "failed" } })
      .eq("id", contentCalendarId);
    return;
  }

  const b64 = line.response.body?.data?.[0]?.b64_json;
  if (!b64) {
    await supabase
      .from("content_calendar")
      .update({ metadata: { ...existingMeta, image_batch_status: "failed" } })
      .eq("id", contentCalendarId);
    return;
  }

  try {
    const imageUrl = await persistBase64Image(supabase, b64, contentCalendarId);
    await supabase
      .from("content_calendar")
      .update({ metadata: { ...existingMeta, image_url: imageUrl, image_batch_status: "completed" } })
      .eq("id", contentCalendarId);
  } catch (e) {
    console.error(`Failed to persist batch image for slot ${contentCalendarId}:`, e instanceof Error ? e.message : e);
    await supabase
      .from("content_calendar")
      .update({ metadata: { ...existingMeta, image_batch_status: "failed" } })
      .eq("id", contentCalendarId);
  }
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
    // publish-scheduled-content) -- read-mostly polling against OpenAI's
    // batch status, no per-call cost to gate against.
    if (!openaiKey) {
      return json({ error: "OPENAI_API_KEY is not configured" }, 503);
    }

    const { data: pendingJobs, error: fetchErr } = await supabase
      .from("image_batch_jobs")
      .select("*")
      .not("status", "in", `(${[...TERMINAL_STATUSES].join(",")})`);

    if (fetchErr) throw new Error(`Failed to fetch pending image batch jobs: ${fetchErr.message}`);

    if (!pendingJobs || pendingJobs.length === 0) {
      return json({ checked: 0, message: "No pending image batches" });
    }

    const results: { batch_id: string; status: string }[] = [];

    for (const job of pendingJobs) {
      const res = await fetch(`${OPENAI_API}/batches/${job.openai_batch_id}`, {
        headers: { Authorization: `Bearer ${openaiKey}` },
      });

      if (!res.ok) {
        console.error(`Failed to check batch ${job.openai_batch_id}: ${res.status}`);
        continue;
      }

      const batch = await res.json();
      results.push({ batch_id: job.openai_batch_id, status: batch.status });

      if (batch.status === job.status && !TERMINAL_STATUSES.has(batch.status)) {
        continue; // no change, nothing to do
      }

      if (batch.status === "completed") {
        // Successful results
        if (batch.output_file_id) {
          const outputRes = await fetch(`${OPENAI_API}/files/${batch.output_file_id}/content`, {
            headers: { Authorization: `Bearer ${openaiKey}` },
          });
          if (outputRes.ok) {
            const text = await outputRes.text();
            const lines = text.split("\n").filter((l) => l.trim());
            for (const line of lines) {
              try {
                await applyResultLine(supabase, JSON.parse(line) as BatchOutputLine);
              } catch (e) {
                console.error("Failed to apply batch output line:", e instanceof Error ? e.message : e);
              }
            }
          } else {
            console.error(`Failed to download output file ${batch.output_file_id}: ${outputRes.status}`);
          }
        }

        // Failed/expired-within-batch results
        if (batch.error_file_id) {
          const errorRes = await fetch(`${OPENAI_API}/files/${batch.error_file_id}/content`, {
            headers: { Authorization: `Bearer ${openaiKey}` },
          });
          if (errorRes.ok) {
            const text = await errorRes.text();
            const lines = text.split("\n").filter((l) => l.trim());
            for (const line of lines) {
              try {
                await applyResultLine(supabase, JSON.parse(line) as BatchOutputLine);
              } catch (e) {
                console.error("Failed to apply batch error line:", e instanceof Error ? e.message : e);
              }
            }
          }
        }

        await supabase
          .from("image_batch_jobs")
          .update({
            status: "completed",
            output_file_id: batch.output_file_id || null,
            error_file_id: batch.error_file_id || null,
            completed_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        console.log(`Image batch ${job.openai_batch_id} completed (${job.item_count} items)`);
      } else if (["failed", "expired", "cancelled"].includes(batch.status)) {
        await supabase
          .from("image_batch_jobs")
          .update({ status: batch.status, completed_at: new Date().toISOString() })
          .eq("id", job.id);

        try {
          await supabase.from("automation_alerts").insert({
            alert_type: "content_publish_failure",
            severity: "warning",
            title: `Image batch ${batch.status}`,
            message: `Batch ${job.openai_batch_id} (${job.item_count} images) ended as ${batch.status}. Affected posts will fall back to on-demand generation at publish time.`,
            source: "check-image-batches",
          });
        } catch { /* best-effort */ }
      } else {
        // Still in-flight (validating/in_progress/finalizing) -- just sync status
        await supabase.from("image_batch_jobs").update({ status: batch.status }).eq("id", job.id);
      }
    }

    return json({ checked: results.length, results });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("check-image-batches error:", msg);

    try {
      await supabase.from("automation_alerts").insert({
        alert_type: "function_error",
        severity: "error",
        title: "check-image-batches failed",
        message: msg,
        source: "check-image-batches",
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch { /* best-effort */ }

    return json({ error: msg }, 500);
  }
});
