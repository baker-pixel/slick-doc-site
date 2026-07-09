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
// 1/run reliably succeeds (~19s) now that resume offsets (see
// scanForNextMatch) make each run's download cost constant instead of
// growing with how much of the batch is already applied.
const MAX_APPLY_PER_RUN = 1;

interface BatchOutputLine {
  id: string;
  custom_id: string;
  response: { status_code: number; body?: { data?: Array<{ b64_json?: string }> } } | null;
  error: { code: string; message: string } | null;
}

interface ScanResult {
  found: { line: BatchOutputLine; lineStart: number; lineEnd: number } | null;
  // Everything before this absolute byte offset is fully consumed and never
  // needed again -- safe to persist and resume from on the next poll. When a
  // wanted line was found this equals its lineStart, so a crashed/failed
  // apply re-reads that line next run instead of losing it.
  resumeOffset: number;
  eof: boolean;
}

// Batch output files are one JSON line per item, each line often 1MB+ once
// it includes a base64 image. Two things made the naive approach crash the
// worker ("Memory limit exceeded", HTTP 546):
//   1. Buffering the whole file (or decoding every line to a JS string)
//      materializes tens of MB at once.
//   2. Re-scanning from byte 0 every poll means each successful apply makes
//      the next run's skip-prefix longer -- progress made the crash *more*
//      likely until the job stalled entirely (observed stuck at 14/60).
// So: request the file from a persisted byte offset (HTTP Range; if the
// server ignores it and returns 200, raw prefix bytes are dropped without
// ever being decoded), scan for newlines at the byte level, and only decode
// a line's first bytes to sniff its custom_id. Unwanted lines are dropped
// chunk-by-chunk without being buffered; only a wanted line is ever
// materialized in full.
async function scanForNextMatch(
  url: string,
  headers: Record<string, string>,
  wantedIds: Set<string>,
  startOffset: number,
): Promise<ScanResult> {
  const res = await fetch(url, { headers: { ...headers, Range: `bytes=${startOffset}-` } });

  // Requested range starts at/past EOF -- everything already consumed.
  if (res.status === 416) {
    res.body?.cancel().catch(() => {});
    return { found: null, resumeOffset: startOffset, eof: true };
  }
  if (!res.ok || !res.body) {
    console.error(`Failed to download batch file: ${res.status}`);
    return { found: null, resumeOffset: startOffset, eof: false };
  }

  const ranged = res.status === 206;
  let absPos = ranged ? startOffset : 0;

  const HEAD_SNIFF_BYTES = 512; // custom_id sits well within a line's first bytes
  const decoder = new TextDecoder();

  let lineStart = startOffset;
  let verdict: "unknown" | "wanted" | "discard" = "unknown";
  let head = new Uint8Array(0);
  let lineChunks: Uint8Array[] = [];
  let lineBytes = 0;
  let resumeOffset = startOffset;
  let found: ScanResult["found"] = null;
  let eof = false;

  const resetLine = (nextStart: number) => {
    lineStart = nextStart;
    head = new Uint8Array(0);
    lineChunks = [];
    lineBytes = 0;
  };

  const decideVerdict = (): "wanted" | "discard" => {
    const m = decoder.decode(head).match(/"custom_id"\s*:\s*"([^"]+)"/);
    return m && wantedIds.has(m[1]) ? "wanted" : "discard";
  };

  const materializeLine = (): BatchOutputLine | null => {
    const all = new Uint8Array(lineBytes);
    let o = 0;
    for (const c of lineChunks) {
      all.set(c, o);
      o += c.length;
    }
    try {
      return JSON.parse(decoder.decode(all)) as BatchOutputLine;
    } catch (e) {
      console.error("Failed to parse batch output line:", e instanceof Error ? e.message : e);
      return null;
    }
  };

  const reader = res.body.getReader();
  try {
    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) {
        eof = true;
        break;
      }
      let chunk = value as Uint8Array;

      // Server ignored Range and sent the file from byte 0 -- drop the
      // already-consumed prefix without decoding any of it.
      if (absPos < startOffset) {
        if (absPos + chunk.length <= startOffset) {
          absPos += chunk.length;
          continue;
        }
        chunk = chunk.subarray(startOffset - absPos);
        absPos = startOffset;
      }

      let idx = 0;
      while (idx < chunk.length) {
        const nl = chunk.indexOf(10, idx); // "\n"
        const seg = chunk.subarray(idx, nl === -1 ? chunk.length : nl);

        if (verdict === "unknown") {
          if (head.length < HEAD_SNIFF_BYTES && seg.length > 0) {
            const take = Math.min(HEAD_SNIFF_BYTES - head.length, seg.length);
            const merged = new Uint8Array(head.length + take);
            merged.set(head);
            merged.set(seg.subarray(0, take), head.length);
            head = merged;
          }
          if (head.length >= HEAD_SNIFF_BYTES || nl !== -1) verdict = decideVerdict();
        }
        if (verdict === "wanted") {
          lineChunks.push(seg.slice());
          lineBytes += seg.length;
        }

        if (nl === -1) {
          absPos += chunk.length - idx;
          break;
        }

        const lineEnd = absPos + (nl - idx) + 1; // past the newline
        absPos = lineEnd;
        idx = nl + 1;

        if (verdict === "wanted") {
          const line = materializeLine();
          if (line) {
            found = { line, lineStart, lineEnd };
            break outer;
          }
          resumeOffset = lineEnd; // unparseable -- skip it for good
        } else {
          resumeOffset = lineEnd;
        }
        verdict = "unknown";
        resetLine(lineEnd);
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch { /* stream may already be closed */ }
  }

  // File may not end with a trailing newline -- flush the last partial line.
  if (eof && !found && lineBytes > 0) {
    if (verdict === "unknown") verdict = decideVerdict();
    if (verdict === "wanted") {
      const line = materializeLine();
      if (line) found = { line, lineStart, lineEnd: absPos };
    }
    if (!found) resumeOffset = absPos;
  }

  return { found, resumeOffset, eof };
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

async function markBatchStatus(supabase: any, contentCalendarId: string, existingMeta: Record<string, unknown>, status: string) {
  await supabase
    .from("content_calendar")
    .update({ metadata: { ...existingMeta, image_batch_status: status } })
    .eq("id", contentCalendarId);
}

async function applyResultLine(supabase: any, line: BatchOutputLine) {
  const contentCalendarId = line.custom_id;

  const { data: slot } = await supabase
    .from("content_calendar")
    .select("metadata")
    .eq("id", contentCalendarId)
    .maybeSingle();

  const existingMeta = (slot?.metadata as Record<string, unknown>) || {};

  // sync-fill-missing-images (a separate, synchronous image-generation
  // path) may have already filled this row in while this batch was still
  // in flight -- skip the decode+upload entirely rather than paying for
  // and writing a second, redundant image over a real one.
  if (existingMeta.image_url) {
    await markBatchStatus(supabase, contentCalendarId, existingMeta, "completed");
    return;
  }

  if (line.error || !line.response || line.response.status_code !== 200) {
    console.warn(`Batch item failed for slot ${contentCalendarId}:`, line.error?.message || "no response");
    await markBatchStatus(supabase, contentCalendarId, existingMeta, "failed");
    return;
  }

  const b64 = line.response.body?.data?.[0]?.b64_json;
  if (!b64) {
    await markBatchStatus(supabase, contentCalendarId, existingMeta, "failed");
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
    await markBatchStatus(supabase, contentCalendarId, existingMeta, "failed");
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
          .select("id, metadata")
          .eq("metadata->>image_batch_id", job.openai_batch_id)
          .or("metadata->>image_batch_status.is.null,metadata->>image_batch_status.not.in.(completed,failed)");

        const remainingIds = new Set<string>();
        // Slots sync-fill-missing-images already gave an image don't need
        // their batch result at all -- flip them to completed directly
        // instead of paying a file scan to reach the same conclusion.
        for (const slot of remainingSlots || []) {
          const meta = (slot.metadata as Record<string, unknown>) || {};
          if (meta.image_url) {
            await markBatchStatus(supabase, slot.id, meta, "completed");
          } else {
            remainingIds.add(slot.id);
          }
        }

        if (remainingIds.size > 0) {
          const offsets = ((job.resume_offsets as Record<string, number>) || {});
          let applied = 0;
          let allFilesExhausted = true;

          for (const fileId of [batch.output_file_id, batch.error_file_id].filter(Boolean)) {
            if (applied >= MAX_APPLY_PER_RUN) {
              allFilesExhausted = false;
              break;
            }

            const scan = await scanForNextMatch(
              `${OPENAI_API}/files/${fileId}/content`,
              { Authorization: `Bearer ${openaiKey}` },
              remainingIds,
              offsets[fileId] || 0,
            );

            let newOffset = scan.resumeOffset;
            if (scan.found) {
              allFilesExhausted = false;
              try {
                await applyResultLine(supabase, scan.found.line);
                applied++;
                remainingIds.delete(scan.found.line.custom_id);
                newOffset = scan.found.lineEnd;
              } catch (e) {
                console.error(`Failed to apply batch line for ${scan.found.line.custom_id}:`, e instanceof Error ? e.message : e);
                newOffset = scan.found.lineStart; // retry this line next run
              }
            } else if (!scan.eof) {
              allFilesExhausted = false; // download error -- retry from same offset
            }
            offsets[fileId] = newOffset;
          }

          await supabase.from("image_batch_jobs").update({ resume_offsets: offsets }).eq("id", job.id);

          // Both files scanned to EOF and none of the remaining slots'
          // results exist in them -- they'd otherwise stay "remaining"
          // forever and pin this job in finalizing. Mark them failed so
          // sync-fill-missing-images / publish-time fallback takes over.
          if (applied === 0 && allFilesExhausted && remainingIds.size > 0) {
            console.warn(`Image batch ${job.openai_batch_id}: ${remainingIds.size} slots have no result in output/error files; marking failed`);
            for (const slot of remainingSlots || []) {
              if (!remainingIds.has(slot.id)) continue;
              await markBatchStatus(supabase, slot.id, (slot.metadata as Record<string, unknown>) || {}, "failed");
            }
          }

          console.log(`Image batch ${job.openai_batch_id}: applied ${applied}/${remainingIds.size + applied} remaining items this run`);
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
