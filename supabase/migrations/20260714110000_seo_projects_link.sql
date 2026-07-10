-- Phase A — Projects as the spine. Wire SEO audit findings into the existing
-- client_projects / project_milestones model (which the portal and admin
-- already render) rather than a parallel table.
--
--   kind            : distinguishes an engine-generated plan ('seo') from the
--                     tier-template projects ('custom'). One SEO project per
--                     client (partial unique index below) so re-audits update
--                     the same plan instead of piling up duplicates.
--   source_audit_id : the audit this plan was last built from (traceability).
--   milestone.metadata : carries the finding reference (check_id, pages,
--                     impact/effort, wp_applyable) so a milestone can be
--                     reconciled across audits and later drive the apply UI.

ALTER TABLE public.client_projects
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS source_audit_id uuid REFERENCES public.seo_audits(id) ON DELETE SET NULL;

ALTER TABLE public.project_milestones
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- One engine-generated project per (client, kind) -- the idempotent upsert target.
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_projects_client_kind
  ON public.client_projects (client_account_id, kind)
  WHERE kind <> 'custom';
