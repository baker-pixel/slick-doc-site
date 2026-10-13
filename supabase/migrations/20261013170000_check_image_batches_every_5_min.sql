-- check-image-batches applies at most one finished image per run (a larger
-- batch of base64 decodes exhausted the worker -- see MAX_APPLY_PER_RUN), and
-- it ran every 30 minutes, so a client's 8-image backlog took ~4 hours to
-- show up after OpenAI had already finished. Poll every 5 minutes instead:
-- same per-run cost (~19s each), 6x the throughput. Revert by setting the
-- schedule back to '*/30 * * * *'.
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'check-image-batches';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(v_jobid, schedule := '*/5 * * * *');
  END IF;
END $$;
