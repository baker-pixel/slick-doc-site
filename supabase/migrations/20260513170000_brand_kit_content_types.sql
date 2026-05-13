-- Add brand_guidelines content_type for the generate-brand-guidelines function.

ALTER TABLE public.generated_content
  DROP CONSTRAINT IF EXISTS generated_content_content_type_check;

ALTER TABLE public.generated_content
  ADD CONSTRAINT generated_content_content_type_check
    CHECK (content_type IN (
      'email', 'email_copy', 'blog_post', 'social_post',
      'ad_copy', 'report', 'other', 'brand_guidelines'
    ));
