-- connected_sites was missing the admin RLS policy its sibling SEO tables
-- (seo_audits, page_speed_results, etc.) all have. The admin panel's WordPress
-- connection check reads this table directly as the admin's own session, not
-- via the service-role admin edge function, so with no admin policy it always
-- returned zero rows -- every client showed "WordPress isn't connected" and
-- the one-click "Apply fix" button was permanently disabled for everyone,
-- even when the connection genuinely existed.
CREATE POLICY "Admins can manage connected_sites"
ON public.connected_sites
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));
