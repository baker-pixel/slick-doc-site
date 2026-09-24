-- clientMailboxPoll classifies genuine replies (prospects.status = 'replied')
-- but only ever fetched IMAP headers, never the message body -- there was no
-- way for the client portal or admin to see what a prospect actually wrote
-- back. This adds storage for it; clientMailboxPoll is updated separately to
-- populate it on the next reply it detects (existing 'replied' rows are left
-- with these columns NULL -- no historical body to backfill).
ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS reply_snippet TEXT,
  ADD COLUMN IF NOT EXISTS replied_at    TIMESTAMPTZ;
