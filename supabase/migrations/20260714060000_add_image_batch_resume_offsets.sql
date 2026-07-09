-- check-image-batches re-downloaded each batch output file from byte 0 on
-- every poll, streaming past every already-applied ~1MB base64 line just to
-- reach the next unapplied one. That prefix grows with progress, so each
-- successful apply made the next run heavier until the function died with
-- "Memory limit exceeded" (HTTP 546) before applying anything -- observed
-- stuck at 14/60 items. Persist a per-file byte offset so each poll resumes
-- exactly where the last one stopped (via HTTP Range), making per-run cost
-- constant regardless of how much of the batch is already applied.
--
-- Keyed by OpenAI file id ({"file-abc": 12345678, ...}) since a batch has
-- both an output file and an error file.

ALTER TABLE public.image_batch_jobs
  ADD COLUMN IF NOT EXISTS resume_offsets jsonb NOT NULL DEFAULT '{}'::jsonb;
