-- Webhook idempotency, crash-safe: an event is "claimed" on arrival
-- (processed_at) and "completed" only after its work succeeds (completed_at).
-- A claim that never completes (function timeout/crash) goes stale and the next
-- Stripe retry takes it over instead of the event being silently lost.
ALTER TABLE public.stripe_events ADD COLUMN IF NOT EXISTS completed_at timestamptz;
UPDATE public.stripe_events SET completed_at = processed_at WHERE completed_at IS NULL;
