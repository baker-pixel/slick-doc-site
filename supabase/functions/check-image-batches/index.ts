import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API = "https://api.openai.com/v1";
const TERMINAL_STATUSES = new Set(["completed", "failed", "expired", "cancelled"]);
// Decoding + uploading a base64 image is heavy enough that doing all of a
// large batch's items in one invocation can exhaust the function's compute
// budget (seen directly: 12/60 succeeded before a WORKER_RESOURCE_LIMIT
// crash). Cap how many get applied per run -- "finalizing" (a real OpenAI
// batch-status value we're repurposing) means "OpenAI is done, we're still
// working through applying results", so leftover items get picked up again
// next poll instead of being stranded once local status flips to completed.
// Verified empirically: even 3/run hits WORKER_RESOURCE_LIMIT on this
// runtime (same wall-clock time as a successful 1/run -- a hard resource
// ceiling, not a timeout). 1/run reliably succeeds (~19s). Slow, but these
// images have a multi-day lead time before they're needed, so draining a
// backlog over several hours of 30-min polls is a non-issue. Keeping
// per-batch submission size small (see generate-social-images-batch) is the
// real fix so this rarely needs to drain a large backlog at all.
const MAX_APPLY_PER_RUN = 1;

interface BatchOutputLine {
  id: string;
  custom_id: string;
  response: { status_code: number; body?: { data?: Array<{ b64_json?: string }> } } | null;
  error: { code: string; message: string } | null;
}

// Batch output files are one JSON line per item, each line often 1MB+ once
// it includes a base64 image. Downloading the whole file with .text() (or
// even JSON.parse-ing every line) buffers the entire thing in memory at
// once, which is what actually caused the WORKER_RESOURCE_LIMIT crash on a
// 60-item batch. Stream the response instead and stop reading as soon as
// we've found the lines we need -- never materialize more than one line's
// worth of base64 at a time, and never read past what this run needs.
async function findMatchingLines(
  url: string,
  headers: Record<string, string>,
  wantedIds: Set<string>,
  maxCount: number,
): Promise<BatchOutputLine[]> {
  const res = await fetch(url, { headers });
  if (!res.ok || !res.body) {
    console.error(`Failed to download batch file: ${res.status}`);
    return [];
  }

  const found: BatchOutputLine[] = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (found.length < maxCount) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        if (!line.trim()) continue;

        // Cheap check before the expensive JSON.parse (which would
        // materialize the line's base64 payload) -- custom_id sits near
        // the start of the line, well before that payload.
        const idMatch = line.match(/"custom_id"\s*:\s*"([^"]+)"/);
        if (!idMatch || !wantedIds.has(idMatch[1])) continue;

        try {
          found.push(JSON.parse(line) as BatchOutputLine);
        } catch (e) {
          console.error("Failed to parse batch output line:", e instanceof Error ? e.message : e);
        }
        if (found.length >= maxCount) break;
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* stream may already be closed */ }
  }

  return found;
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
        // Which of this batch's slots still need a result applied -- lets us
        // resume across multiple polls instead of doing everything at once.
        const { data: remainingSlots } = await supabase
          .from("content_calendar")
          .select("id")
          .eq("metadata->>image_batch_id", job.openai_batch_id)
          .or("metadata->>image_batch_status.is.null,metadata->>image_batch_status.not.in.(completed,failed)");

        const remainingIds = new Set((remainingSlots || []).map((s: any) => s.id));

        if (remainingIds.size > 0) {
          const linesToApply: BatchOutputLine[] = [];

          for (const fileId of [batch.output_file_id, batch.error_file_id].filter(Boolean)) {
            if (linesToApply.length >= MAX_APPLY_PER_RUN) break;
            const found = await findMatchingLines(
              `${OPENAI_API}/files/${fileId}/content`,
              { Authorization: `Bearer ${openaiKey}` },
              remainingIds,
              MAX_APPLY_PER_RUN - linesToApply.length,
            );
            linesToApply.push(...found);
          }

          for (const line of linesToApply) {
            try {
              await applyResultLine(supabase, line);
            } catch (e) {
              console.error(`Failed to apply batch line for ${line.custom_id}:`, e instanceof Error ? e.message : e);
            }
          }

          console.log(`Image batch ${job.openai_batch_id}: applied ${linesToApply.length}/${remainingIds.size} remaining items this run`);
        }

        const { count: stillRemaining } = await supabase
          .from("content_calendar")
          .select("id", { count: "exact", head: true })
          .eq("metadata->>image_batch_id", job.openai_batch_id)
          .or("metadata->>image_batch_status.is.null,metadata->>image_batch_status.not.in.(completed,failed)");

        if (!stillRemaining || stillRemaining === 0) {
          await supabase
            .from("image_batch_jobs")
            .update({
              status: "completed",
              output_file_id: batch.output_file_id || null,
              error_file_id: batch.error_file_id || null,
              completed_at: new Date().toISOString(),
            })
            .eq("id", job.id);
          console.log(`Image batch ${job.openai_batch_id} fully applied (${job.item_count} items)`);
        } else {
          // OpenAI is done, but we're still working through applying
          // results -- leave in a non-terminal state so the next poll
          // picks up the rest instead of this job being skipped forever.
          await supabase
            .from("image_batch_jobs")
            .update({
              status: "finalizing",
              output_file_id: batch.output_file_id || null,
              error_file_id: batch.error_file_id || null,
            })
            .eq("id", job.id);
        }
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
