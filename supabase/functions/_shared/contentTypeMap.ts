// generated_content.content_type has a DB check constraint allowing only:
// email, email_copy, blog_post, social_post, ad_copy, report, other,
// brand_guidelines. Producers (content_calendar, tierPolicy, batch jobs) use
// a wider vocabulary (e.g. "google_post", "email_newsletter") describing the
// actual content, not the DB bucket it lives in. Anything not mapped/allowed
// falls back to "other" rather than failing the insert outright -- a slot
// that silently never fills is worse than one filed under a generic bucket.
const ALLOWED_DB_CONTENT_TYPES = new Set([
  "email", "email_copy", "blog_post", "social_post", "ad_copy", "report", "other", "brand_guidelines",
]);

const CONTENT_TYPE_ALIASES: Record<string, string> = {
  google_post: "other",
  email_newsletter: "email",
};

export function toDbContentType(contentType: string): string {
  const mapped = CONTENT_TYPE_ALIASES[contentType] ?? contentType;
  return ALLOWED_DB_CONTENT_TYPES.has(mapped) ? mapped : "other";
}
