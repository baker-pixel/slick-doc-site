-- process-email-queue claims a row ("processing") before sending. If the
-- worker died mid-send the row stayed "processing" forever and its sequence
-- step was silently lost (59 outreach steps were found stuck this way). The
-- claim time lets the queue processor recover such rows.
alter table public.email_queue add column if not exists claimed_at timestamptz;

create index if not exists email_queue_processing_claimed_idx
  on public.email_queue (claimed_at)
  where status = 'processing';
