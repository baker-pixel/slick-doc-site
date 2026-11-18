// Deterministic llms.txt generation for the AEO "missing_llms_txt" fix.
// No LLM call -- built only from facts already on file (business name, url,
// context_profile business_summary) plus the page titles this audit's own
// crawl actually found, so it can't invent a page or a description.

export interface LlmsTxtFacts {
  name: string;
  url: string;
  description?: string | null;
  pages: { title: string; url: string }[];
}

export function buildLlmsTxt(facts: LlmsTxtFacts): string {
  const lines: string[] = [`# ${facts.name}`, "", `> ${facts.description || `${facts.name} -- ${facts.url}`}`];
  if (facts.pages.length) {
    lines.push("", "## Pages", "");
    for (const p of facts.pages) {
      lines.push(`- [${p.title || p.url}](${p.url})`);
    }
  }
  return lines.join("\n") + "\n";
}
