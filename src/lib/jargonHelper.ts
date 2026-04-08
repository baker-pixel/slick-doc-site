/** Replace common marketing jargon with plain-English explanations in parentheses. */
const JARGON_MAP: [RegExp, string][] = [
  [/\bSEO\b(?!\s*\()/g, "SEO (how easy you are to find on Google)"],
  [/\bCTR\b(?!\s*\()/g, "CTR (how many people click on your website)"],
  [/\b[Bb]ounce rate\b(?!\s*\()/g, "Bounce rate (how quickly people leave your site)"],
  [/\b[Ss]chema markup\b(?!\s*\()/g, "Schema markup (special code that helps Google understand your site)"],
  [/\bCore Web Vitals\b(?!\s*\()/g, "Core Web Vitals (how fast and smooth your website loads)"],
  [/\bCTA\b(?!\s*\()/g, "CTA (a button or link asking visitors to take action)"],
  [/\bROAS\b(?!\s*\()/g, "ROAS (how much revenue you get back for every dollar spent on ads)"],
  [/\bCRM\b(?!\s*\()/g, "CRM (a tool to track your leads and customers)"],
  [/\bKPI\b(?!\s*\()/g, "KPI (a number you track to see if things are working)"],
  [/\bPPC\b(?!\s*\()/g, "PPC (pay-per-click advertising on Google or social media)"],
];

export function addJargonExplanations(text: string): string {
  let result = text;
  for (const [pattern, replacement] of JARGON_MAP) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
