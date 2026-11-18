// Scores for the free website scan (Quick Analysis), computed from measured signals.
//
// Before this, the SEO, Technical and Conversion scores were numbers an LLM chose after
// reading the HTML, so two scans could disagree and no score could be traced to evidence.
// Now: SEO/Technical come from the same versioned rubric the client SEO audit uses
// (seoRubric.ts + seoChecks.ts), and Conversion from fixed, visible signals. The LLM only
// explains the result. Same page in, same score out.
//
// Pure functions: no network, no LLM, no Deno APIs.
import { runChecks, type Finding } from "./seoChecks.ts";
import { RUBRIC_VERSION, computeScores } from "./seoRubric.ts";
import type { PageSignals } from "./seoSignals.ts";

export const SCAN_SCORE_VERSION = `scan-score.v1+${RUBRIC_VERSION}`;

export interface MeasuredCheck {
  check_id: string;
  title: string;
  severity: string;
  /** Pages (of those checked) the problem was found on. */
  pages: number;
  evidence: unknown;
}

export interface SearchTechnicalResult {
  seo: number;
  technical: number;
  pagesChecked: number;
  /** True when the homepage is an un-rendered JS shell: head tags were read, body content could not be. */
  limited: boolean;
  checks: MeasuredCheck[];
}

/** SEO = on-page + content health; Technical = technical health. Per page, then averaged. */
export function scoreSearchAndTechnical(pages: PageSignals[]): SearchTechnicalResult {
  const reachable = pages.filter((p) => p.reachable);
  const raw = reachable.flatMap(runChecks);
  const findings = raw.map((f) => ({ category: f.category, severity: f.severity, check_id: f.check_id, page: f.pages[0] }));
  const { subscores } = computeScores(findings, { pages: reachable.map((p) => p.url), performancePages: [] });

  const onPage = subscores.on_page ?? 100;
  const content = subscores.content ?? 100;
  // Same relative weights the rubric uses for these two categories (0.25 and 0.15).
  const seo = Math.round((onPage * 0.25 + content * 0.15) / 0.4);
  const technical = subscores.technical ?? 100;

  const byCheck = new Map<string, MeasuredCheck>();
  for (const f of raw as Array<Omit<Finding, "id" | "status">>) {
    if (f.severity === "good") continue;
    const cur = byCheck.get(f.check_id);
    if (cur) cur.pages += 1;
    else byCheck.set(f.check_id, { check_id: f.check_id, title: f.title, severity: f.severity, pages: 1, evidence: f.evidence.value });
  }
  const checks = [...byCheck.values()].sort((a, b) => (b.severity === "critical" ? 1 : 0) - (a.severity === "critical" ? 1 : 0) || b.pages - a.pages);

  return { seo, technical, pagesChecked: reachable.length, limited: !!pages[0]?.looks_like_empty_spa, checks };
}

// ---------------------------------------------------------------- conversion

export interface ConversionSignal {
  label: string;
  found: boolean;
  points: number;
  max: number;
}

export interface ConversionResult {
  score: number;
  signals: ConversionSignal[];
  findings: string[];
  recommendations: string[];
}

const ACTION_WORDS =
  /\b(book|schedule|get (a |your )?(free )?(quote|estimate|started|consultation|audit|demo|proposal|in touch)|free (quote|estimate|consultation|audit|trial|demo|assessment)|contact( us)?|call (us|now|today)|request|sign up|start (now|free|your)|buy( now)?|order|reserve|apply|talk to|speak with|download|get the (ios |android )?app|subscribe|join|try (it )?(free|now)|shop( now)?|add to cart|donate|register|enroll)\b/i;

function clickableTexts(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const t = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (t && t.length <= 60) out.push(t);
  }
  return out;
}

/** What a visitor can actually do on the page. Fixed points per signal; every point traces to something in the HTML. */
export function scoreConversion(html: string): ConversionResult {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ");
  const ctas = new Set(clickableTexts(html).filter((t) => ACTION_WORDS.test(t)).map((t) => t.toLowerCase()));

  const form = /<form[\s>][\s\S]*?<(input|textarea|select)\b/i.test(html);
  const tel = /href=["']tel:/i.test(html);
  const phoneShown = !tel && /\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/.test(text);
  const booking = /calendly\.com|acuityscheduling|cal\.com|savvycal|youcanbook|setmore|squareup\.com\/appointments|meetings\.hubspot|\/book(-now|ing)?\b|\/schedule\b/i.test(html);
  const trust = /\b(licensed|insured|bonded|certified|accredited|award[- ]winning|guarantee[d]?|years of experience|since (19|20)\d\d|family[- ]owned|bbb|a\+ rating)\b/i.test(text);
  const offer = /free (quote|estimate|consultation|audit|trial|assessment|demo)|no[- ]obligation|\$\s?\d|\bpricing\b|starting at/i.test(text);

  const signals: ConversionSignal[] = [
    { label: "A contact or lead form", found: form, points: form ? 20 : 0, max: 20 },
    { label: "A tap-to-call phone number", found: tel, points: tel ? 15 : phoneShown ? 8 : 0, max: 15 },
    { label: "Clear action buttons (book, get a quote, contact)", found: ctas.size > 0, points: ctas.size >= 3 ? 25 : ctas.size > 0 ? 15 : 0, max: 25 },
    { label: "Online booking or scheduling", found: booking, points: booking ? 15 : 0, max: 15 },
    { label: "Trust marks (licensed, guaranteed, years in business)", found: trust, points: trust ? 10 : 0, max: 10 },
    { label: "A clear offer or pricing", found: offer, points: offer ? 15 : 0, max: 15 },
  ];
  const score = signals.reduce((s, x) => s + x.points, 0);

  const findings: string[] = [];
  const recommendations: string[] = [];
  const found = signals.filter((s) => s.found).map((s) => s.label.toLowerCase());
  if (found.length) findings.push(`Found on the page: ${found.join("; ")}.`);
  if (!form) { findings.push("No contact or lead form on the page."); recommendations.push("Add a short contact form (name, email, one question) where visitors can reach you without leaving the page."); }
  if (!tel) {
    findings.push(phoneShown ? "A phone number is shown but isn't tap-to-call on phones." : "No phone number on the page.");
    recommendations.push(phoneShown ? "Make the phone number a tap-to-call link." : "Show a phone number in the header as a tap-to-call link.");
  }
  if (ctas.size === 0) { findings.push("No clear action buttons such as Book, Get a quote or Contact us."); recommendations.push("Add a prominent button with a specific action in the first screen of the page."); }
  else if (ctas.size < 3) recommendations.push("Repeat your main call to action further down the page so visitors can act wherever they finish reading.");
  if (!booking) recommendations.push("Let visitors book a time online instead of waiting for a reply.");
  if (!offer) { findings.push("No clear offer or pricing signal (a free quote, consultation or starting price)."); recommendations.push("State a concrete offer, such as a free quote or consultation, so visitors know the next step costs nothing."); }
  if (!trust) recommendations.push("Add trust marks such as licences, guarantees or years in business near your main button.");

  return { score, signals, findings: findings.slice(0, 4), recommendations: recommendations.slice(0, 4) };
}
