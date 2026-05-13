import DOMPurify from "dompurify";

const config: DOMPurify.Config = {
  ALLOWED_TAGS: [
    "p", "br", "strong", "em", "b", "i", "u", "s",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li",
    "blockquote", "pre", "code",
    "a", "span", "div",
    "img",
    "table", "thead", "tbody", "tr", "th", "td",
    "hr",
  ],
  ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "target", "rel", "style"],
  ALLOW_DATA_ATTR: false,
  FORBID_SCRIPTS: true,
};

export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return "";
  return DOMPurify.sanitize(dirty, config);
}
