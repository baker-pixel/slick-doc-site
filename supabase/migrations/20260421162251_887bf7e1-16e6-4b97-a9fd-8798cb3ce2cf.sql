CREATE TABLE public.ai_fixes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_reference_id TEXT,
  issue_title TEXT NOT NULL,
  issue_summary TEXT,
  severity TEXT DEFAULT 'medium',
  fix_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  ready_to_apply JSONB,
  status TEXT NOT NULL DEFAULT 'proposed',
  apply_target TEXT,
  before_snapshot JSONB,
  after_snapshot JSONB,
  error_message TEXT,
  applied_by UUID,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_fixes_client ON public.ai_fixes(client_account_id);
CREATE INDEX idx_ai_fixes_source ON public.ai_fixes(source);
CREATE INDEX idx_ai_fixes_status ON public.ai_fixes(status);

ALTER TABLE public.ai_fixes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all ai_fixes"
ON public.ai_fixes FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Clients view their own ai_fixes"
ON public.ai_fixes FOR SELECT
USING (
  client_account_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  )
);

CREATE TRIGGER ai_fixes_updated_at
BEFORE UPDATE ON public.ai_fixes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();