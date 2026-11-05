-- Per-client channel plan: which social channels a client posts on and how
-- their monthly post quota is split between them. The quota itself is the
-- tier's postsPerMonth (tierPolicy.ts); this table only holds the split.
--
-- weight is a relative share, not a count: counts break when the tier changes
-- or a cycle is not 30 days. "Even split" stores 1 per channel; a custom split
-- stores the counts the client chose (so they sum to the tier quota). Counts
-- are derived (largest remainder) when a cycle is first scheduled and
-- snapshotted on client_cycles.channel_plan, so an edit here applies from the
-- NEXT cycle, never mid-cycle. The first plan a client ever saves applies to
-- the current cycle, since nothing has been snapshotted yet.
--
-- A client with no rows keeps the legacy hardcoded weekly schedule.

CREATE TABLE IF NOT EXISTS public.client_channel_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('facebook', 'instagram', 'linkedin', 'twitter')),
  active boolean NOT NULL DEFAULT true,
  weight integer NOT NULL DEFAULT 0 CHECK (weight BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A real UNIQUE constraint (not a partial index) so upserts can use onConflict.
  CONSTRAINT client_channel_plan_client_platform_key UNIQUE (client_account_id, platform)
);

ALTER TABLE public.client_channel_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_channel_plan_admin ON public.client_channel_plan
  FOR ALL TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

-- Portal users read their own plan; writes go through an edge function that
-- validates (weights sum to 100, channels connected) with the service role.
CREATE POLICY client_channel_plan_portal_select ON public.client_channel_plan
  FOR SELECT TO authenticated
  USING (client_account_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = (select auth.uid())
  ));

-- What this cycle was scheduled with: { quota, counts: {facebook: 12, ...}, weights: {...}, snapshotted_at }.
-- A separate column from client_cycles.plan because start-client-cycle
-- rewrites that whole jsonb and would clobber a nested key.
ALTER TABLE public.client_cycles
  ADD COLUMN IF NOT EXISTS channel_plan jsonb;
