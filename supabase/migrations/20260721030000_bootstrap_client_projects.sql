-- Creates empty client_projects shells (status='awaiting_setup') for a client
-- right when onboarding completes, so the portal shows "here's what's coming"
-- instead of an empty Projects tab until the next cron/scan happens to run.
-- Tier-gating (whether prospect is on this client's plan) is decided in
-- TypeScript by workflowUnlock.ts via tierPolicy.ts, not duplicated here --
-- see tierPolicy.ts's Phase B header comment for why that map stays single-
-- source. ON CONFLICT DO NOTHING means this never overwrites a project an
-- engine already created/graduated -- ordering vs. the engines doesn't matter.
--
-- Names are copy-pasted verbatim from each engine's own create path (they
-- never rename an existing project on their update branch, so a mismatch
-- here would silently "rename" itself the moment the real engine runs):
--   seoProject.ts:62        name: "SEO Action Plan"
--   prospectProject.ts:37   name: "Lead Generation Plan"
--   socialStrategy.ts:61    name: "Social Media Plan"
CREATE OR REPLACE FUNCTION public.bootstrap_client_projects(
  p_client_account_id uuid,
  p_include_prospect boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.client_projects (client_account_id, kind, name, description, status, start_date, progress_percentage)
  VALUES
    (p_client_account_id, 'seo',    'SEO Action Plan',   'Setting up — check back soon.', 'awaiting_setup', CURRENT_DATE, 0),
    (p_client_account_id, 'social', 'Social Media Plan', 'Setting up — check back soon.', 'awaiting_setup', CURRENT_DATE, 0)
  ON CONFLICT (client_account_id, kind) WHERE kind <> 'custom' DO NOTHING;

  IF p_include_prospect THEN
    INSERT INTO public.client_projects (client_account_id, kind, name, description, status, start_date, progress_percentage)
    VALUES (p_client_account_id, 'prospect', 'Lead Generation Plan', 'Setting up — check back soon.', 'awaiting_setup', CURRENT_DATE, 0)
    ON CONFLICT (client_account_id, kind) WHERE kind <> 'custom' DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_client_projects TO authenticated, service_role;
