// Turns the four lead tables into one list of people. Pure functions, no UI.
//
//   quick_scan   prospects (source "inbound")   an instant /quick-analysis scan
//   gap_analysis gap_analysis_submissions       the full multi-step questionnaire
//   contact      contact_submissions            the contact / strategy call form
//   pdf          pdf_leads                      someone who downloaded a PDF
//
// One person can appear in several (and repeat the same one, e.g. scanning
// their site twice), so rows are grouped by email.

export type Source = "quick_scan" | "gap_analysis" | "contact" | "pdf";
export type Stage = "New" | "Follow up" | "Call booked" | "Invited" | "Client";
export type Interest = "High" | "Medium" | "Low";

export interface Touch {
  id: string;
  source: Source;
  /** When this happened (completion time for a finished analysis). */
  at: string;
  label: string;
  detail?: string;
  score?: number | null;
  /** Public report link token (quick scans). */
  reportToken?: string | null;
  raw: any;
}

export interface Lead {
  /** Lowercased email: the identity of a lead. */
  key: string;
  email: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  business: string | null;
  website: string | null;
  phone: string | null;
  challenge: string | null;
  /** Newest first. */
  touches: Touch[];
  firstSeen: string;
  lastActivity: string;
  latestScore: number | null;
  interest: Interest;
  stage: Stage;
  /** gap_analysis_submissions.id of their newest full analysis, for the invite link-back. */
  gapId: string | null;
}

export const INTEREST_HELP: Record<Interest, string> = {
  High: "Finished the full gap analysis or sent the contact form.",
  Medium: "Ran a quick scan or started the full analysis.",
  Low: "Only downloaded a PDF.",
};

/** localStorage key: when the admin last opened the Leads page (drives the "new" markers and the sidebar badge). */
export const LEADS_LAST_SEEN_KEY = "admin_leads_last_seen";

/** Within this many days of their last activity a lead still counts as "New". */
export const NEW_WINDOW_DAYS = 3;

const DAY_MS = 86_400_000;

const clean = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
};

const hostOf = (url: string | null): string | null => {
  if (!url) return null;
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const humanize = (s: string) => s.replace(/_/g, " ");

const score = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function quickScanTouch(p: any): Touch {
  const host = hostOf(clean(p.website_url));
  return {
    id: p.id,
    source: "quick_scan",
    at: p.created_at,
    label: host ? `Ran a quick scan of ${host}` : "Ran a quick scan",
    detail: p.report_sent_at ? "report emailed to them" : "report not emailed yet",
    score: score(p.gap_score),
    reportToken: clean(p.report_token),
    raw: p,
  };
}

function gapTouch(g: any): Touch {
  const finished = g.status === "submitted" && !!g.completed_at && !g.is_partial;
  return {
    id: g.id,
    source: "gap_analysis",
    at: (finished ? g.completed_at : g.updated_at) ?? g.created_at,
    label: finished ? "Completed the full gap analysis" : "Started the full gap analysis, didn't finish",
    score: score(g.overall_score),
    raw: g,
  };
}

function contactTouch(c: any): Touch {
  return {
    id: c.id,
    source: "contact",
    at: c.created_at,
    label: "Sent the contact form",
    detail: c.status && c.status !== "new" ? humanize(c.status) : undefined,
    raw: c,
  };
}

function pdfTouch(p: any): Touch {
  return {
    id: p.id,
    source: "pdf",
    at: p.created_at,
    label: "Downloaded a PDF",
    detail: clean(p.source) ? `from ${humanize(p.source)}` : undefined,
    raw: p,
  };
}

export interface LeadInputs {
  contacts: any[];
  gapAnalyses: any[];
  pdfLeads: any[];
  quickScanLeads: any[];
}

export interface LeadContext {
  /** Emails with an open portal invitation. */
  invitedEmails: Set<string>;
  /** Lowercased emails that already have a client account. */
  clientEmails: Set<string>;
  now?: number;
}

export function buildLeads(input: LeadInputs, ctx: LeadContext): Lead[] {
  const now = ctx.now ?? Date.now();
  const invited = new Set([...ctx.invitedEmails].map((e) => e.toLowerCase()));

  type Raw = { touch: Touch; email: string; name: string | null; first: string | null; last: string | null;
    business: string | null; website: string | null; phone: string | null; challenge: string | null; contactStatus?: string; converted?: boolean };
  const raws: Raw[] = [];

  for (const p of input.quickScanLeads ?? []) {
    const email = clean(p.email);
    if (!email) continue;
    const name = clean(p.name);
    const [first, ...rest] = (name ?? "").split(/\s+/);
    raws.push({ touch: quickScanTouch(p), email, name, first: first || null, last: rest.join(" ") || null,
      business: clean(p.business_type), website: clean(p.website_url), phone: null, challenge: null, converted: p.status === "converted" });
  }
  for (const g of input.gapAnalyses ?? []) {
    const email = clean(g.email);
    if (!email) continue;
    const name = [clean(g.first_name), clean(g.last_name)].filter(Boolean).join(" ") || null;
    raws.push({ touch: gapTouch(g), email, name, first: clean(g.first_name), last: clean(g.last_name),
      business: clean(g.business_name), website: clean(g.website_url), phone: clean(g.phone), challenge: null });
  }
  for (const c of input.contacts ?? []) {
    const email = clean(c.email);
    if (!email) continue;
    const name = [clean(c.first_name), clean(c.last_name)].filter(Boolean).join(" ") || null;
    raws.push({ touch: contactTouch(c), email, name, first: clean(c.first_name), last: clean(c.last_name),
      business: clean(c.business_name), website: clean(c.website_url), phone: null, challenge: clean(c.marketing_challenge),
      contactStatus: c.status });
  }
  for (const p of input.pdfLeads ?? []) {
    const email = clean(p.email);
    if (!email) continue;
    raws.push({ touch: pdfTouch(p), email, name: clean(p.first_name), first: clean(p.first_name), last: null,
      business: null, website: null, phone: null, challenge: null });
  }

  const groups = new Map<string, Raw[]>();
  for (const r of raws) {
    const key = r.email.toLowerCase();
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  const leads: Lead[] = [];
  for (const [key, rows] of groups) {
    rows.sort((a, b) => new Date(b.touch.at).getTime() - new Date(a.touch.at).getTime());
    const touches = rows.map((r) => r.touch);
    // Newest non-empty value wins for each detail.
    const pick = <K extends keyof Raw>(k: K) => rows.map((r) => r[k]).find((v) => v) as Raw[K] | undefined;

    const finishedGap = touches.some((t) => t.source === "gap_analysis" && t.label.startsWith("Completed"));
    const hasContact = touches.some((t) => t.source === "contact");
    const hasMedium = touches.some((t) => t.source === "quick_scan" || t.source === "gap_analysis");
    const interest: Interest = finishedGap || hasContact ? "High" : hasMedium ? "Medium" : "Low";

    const lastActivity = touches[0].at;
    const scores = touches.map((t) => t.score).filter((s): s is number => s != null);
    const callBooked = rows.some((r) => r.contactStatus === "strategy_call");
    const isClient = ctx.clientEmails.has(key) || rows.some((r) => r.converted);

    const stage: Stage =
      isClient ? "Client" :
      invited.has(key) ? "Invited" :
      callBooked ? "Call booked" :
      now - new Date(lastActivity).getTime() <= NEW_WINDOW_DAYS * DAY_MS ? "New" : "Follow up";

    leads.push({
      key,
      email: rows[0].email,
      name: pick("name") ?? "",
      firstName: pick("first") ?? null,
      lastName: pick("last") ?? null,
      business: pick("business") ?? null,
      website: pick("website") ?? null,
      phone: pick("phone") ?? null,
      challenge: pick("challenge") ?? null,
      touches,
      firstSeen: touches[touches.length - 1].at,
      lastActivity,
      // The newest score is the truest picture of their site today, so a re-scan
      // after they fixed things reads right.
      latestScore: scores.length ? scores[0] : null,
      interest,
      stage,
      gapId: touches.find((t) => t.source === "gap_analysis")?.id ?? null,
    });
  }
  return leads;
}
