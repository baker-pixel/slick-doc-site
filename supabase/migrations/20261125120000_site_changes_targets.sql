-- Changes can now name their target by URL. The SEO audit only knows page URLs and
-- image URLs, and a v2 site is never called, so we cannot look up WordPress ids
-- from here: the plugin resolves them itself (url_to_postid / attachment_url_to_postid).
ALTER TABLE public.site_changes
  ADD COLUMN IF NOT EXISTS image_src text,
  ADD COLUMN IF NOT EXISTS ai_fix_id uuid REFERENCES public.ai_fixes(id) ON DELETE SET NULL;

ALTER TABLE public.site_changes DROP CONSTRAINT IF EXISTS site_changes_target_check;
ALTER TABLE public.site_changes ADD CONSTRAINT site_changes_target_check CHECK (
  post_id IS NOT NULL OR media_id IS NOT NULL OR page_url IS NOT NULL OR image_src IS NOT NULL
  OR field IN ('schema_jsonld', 'llms_txt')
);

CREATE INDEX IF NOT EXISTS site_changes_ai_fix_idx ON public.site_changes (ai_fix_id);
