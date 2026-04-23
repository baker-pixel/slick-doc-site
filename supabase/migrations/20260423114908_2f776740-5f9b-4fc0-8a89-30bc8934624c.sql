
-- client_accounts
DROP POLICY IF EXISTS "client_accounts_select" ON public.client_accounts;
DROP POLICY IF EXISTS "client_accounts_insert" ON public.client_accounts;
DROP POLICY IF EXISTS "client_accounts_update" ON public.client_accounts;
DROP POLICY IF EXISTS "client_accounts_delete" ON public.client_accounts;

CREATE POLICY "client_accounts_select" ON public.client_accounts
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "client_accounts_insert" ON public.client_accounts
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "client_accounts_update" ON public.client_accounts
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "client_accounts_delete" ON public.client_accounts
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- sop_documents
DROP POLICY IF EXISTS "sop_documents_select" ON public.sop_documents;
DROP POLICY IF EXISTS "sop_documents_insert" ON public.sop_documents;
DROP POLICY IF EXISTS "sop_documents_update" ON public.sop_documents;
DROP POLICY IF EXISTS "sop_documents_delete" ON public.sop_documents;

CREATE POLICY "sop_documents_select" ON public.sop_documents
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "sop_documents_insert" ON public.sop_documents
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "sop_documents_update" ON public.sop_documents
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "sop_documents_delete" ON public.sop_documents
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- automation_jobs
DROP POLICY IF EXISTS "automation_jobs_select" ON public.automation_jobs;
DROP POLICY IF EXISTS "automation_jobs_insert" ON public.automation_jobs;
DROP POLICY IF EXISTS "automation_jobs_update" ON public.automation_jobs;
DROP POLICY IF EXISTS "automation_jobs_delete" ON public.automation_jobs;

CREATE POLICY "automation_jobs_select" ON public.automation_jobs
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "automation_jobs_insert" ON public.automation_jobs
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "automation_jobs_update" ON public.automation_jobs
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "automation_jobs_delete" ON public.automation_jobs
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- generated_content
DROP POLICY IF EXISTS "generated_content_select" ON public.generated_content;
DROP POLICY IF EXISTS "generated_content_insert" ON public.generated_content;
DROP POLICY IF EXISTS "generated_content_update" ON public.generated_content;
DROP POLICY IF EXISTS "generated_content_delete" ON public.generated_content;

CREATE POLICY "generated_content_select" ON public.generated_content
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "generated_content_insert" ON public.generated_content
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "generated_content_update" ON public.generated_content
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "generated_content_delete" ON public.generated_content
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- client_reports
DROP POLICY IF EXISTS "client_reports_select" ON public.client_reports;
DROP POLICY IF EXISTS "client_reports_insert" ON public.client_reports;
DROP POLICY IF EXISTS "client_reports_update" ON public.client_reports;
DROP POLICY IF EXISTS "client_reports_delete" ON public.client_reports;

CREATE POLICY "client_reports_select" ON public.client_reports
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "client_reports_insert" ON public.client_reports
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "client_reports_update" ON public.client_reports
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "client_reports_delete" ON public.client_reports
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
