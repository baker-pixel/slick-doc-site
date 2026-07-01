-- Admin-accessible RLS policies for prospect engine tables.
-- Pattern consistent with rest of codebase (application-level admin auth).

CREATE POLICY "Admin can read prospects"
  ON public.prospects FOR SELECT
  USING (true);

CREATE POLICY "Admin can update prospects"
  ON public.prospects FOR UPDATE
  USING (true) WITH CHECK (true);

CREATE POLICY "Admin can delete prospects"
  ON public.prospects FOR DELETE
  USING (true);

-- outreach_campaigns: readable from admin UI
CREATE POLICY "Admin can read outreach_campaigns"
  ON public.outreach_campaigns FOR SELECT
  USING (true);

-- client_usage: readable from admin UI
CREATE POLICY "Admin can read client_usage"
  ON public.client_usage FOR SELECT
  USING (true);

CREATE POLICY "Admin can insert client_usage"
  ON public.client_usage FOR INSERT
  WITH CHECK (true);
