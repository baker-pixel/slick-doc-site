// Domains that are never a sensible outbound prospect: social networks, news
// and media, job boards, accelerators/VC, review sites and Big Tech. Apollo's
// keyword search matches these on broad tags like "Technology" (Resonant's
// first batch contained TechCrunch, WIRED, Twitter, Y Combinator and Upwork),
// and each one wastes an LLM scoring call and, if approved, a real email to a
// stranger at a publication. Cheap deterministic filter at the source; fit
// scoring still judges everything that passes.
const NON_PROSPECT_DOMAINS = [
  // social / community / publishing platforms
  "twitter.com", "x.com", "facebook.com", "instagram.com", "linkedin.com", "youtube.com",
  "tiktok.com", "reddit.com", "pinterest.com", "medium.com", "substack.com", "quora.com",
  "github.com", "wikipedia.org", "producthunt.com",
  // news / media / publications
  "techcrunch.com", "wired.com", "forbes.com", "businessinsider.com", "bloomberg.com",
  "reuters.com", "cnn.com", "nytimes.com", "wsj.com", "technologyreview.com", "theverge.com",
  "venturebeat.com", "fastcompany.com", "inc.com", "hbr.org", "towardsdatascience.com",
  // job boards / freelance marketplaces
  "indeed.com", "glassdoor.com", "upwork.com", "fiverr.com", "ziprecruiter.com", "monster.com",
  // accelerators / startup & company databases
  "ycombinator.com", "crunchbase.com", "angel.co", "wellfound.com", "techstars.com",
  // review / directory sites
  "g2.com", "capterra.com", "trustpilot.com", "yelp.com", "tripadvisor.com", "clutch.co",
  // Big Tech
  "google.com", "apple.com", "amazon.com", "microsoft.com", "meta.com",
];

function hostname(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** True for a URL whose host is (a subdomain of) a known non-prospect domain. */
export function isNonProspectDomain(url: string | null | undefined): boolean {
  const host = hostname(url ?? "");
  if (!host) return false;
  return NON_PROSPECT_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Splits discovery results into candidates worth scoring and known non-prospects. */
export function filterProspectCandidates<T extends { website_url: string }>(
  companies: T[],
): { kept: T[]; dropped: T[] } {
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const c of companies) (isNonProspectDomain(c.website_url) ? dropped : kept).push(c);
  return { kept, dropped };
}
