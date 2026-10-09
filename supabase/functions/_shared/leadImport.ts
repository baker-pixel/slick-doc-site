// Pure helpers for CSV lead import (prospect-campaign). No I/O, so every rule
// here is unit tested. The edge function does the database lookups and passes
// the results in (existing emails, opt-outs, bounces).
//
// Parsing and validation live on the server on purpose: the browser only reads
// the file and shows the preview, so there is one implementation of "what is a
// valid lead" and a client cannot bypass it by calling the function directly.

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 10_000;

/** Minimal RFC 4180 parser: quoted fields, "" escapes, CRLF/LF/CR, BOM, , ; or tab delimiter. */
export function parseCsv(input: string): string[][] {
  // Strip a leading byte-order mark (char code 0xFEFF), written without the literal character.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  if (!text.trim()) return [];

  // Delimiter: whichever of , ; tab is most common in the header line.
  const firstLine = text.split(/\r\n|\n|\r/, 1)[0] ?? "";
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const delim = [",", ";", "\t"].reduce((best, d) => (count(d) > count(best) ? d : best), ",");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"' && field === "") {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }

  // Drop fully blank lines.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export type LeadField = "email" | "first_name" | "last_name" | "full_name" | "company" | "website" | "title" | "city" | "note";
export type ColumnMapping = Partial<Record<LeadField, number>>;

const HEADER_ALIASES: Record<LeadField, string[]> = {
  email: ["email", "emailaddress", "e-mail", "mail", "workemail", "businessemail", "contactemail"],
  first_name: ["firstname", "first", "givenname", "fname"],
  last_name: ["lastname", "last", "surname", "familyname", "lname"],
  full_name: ["name", "fullname", "contact", "contactname", "person"],
  company: ["company", "companyname", "organization", "organisation", "business", "businessname", "account", "employer"],
  website: ["website", "websiteurl", "url", "domain", "site", "companywebsite", "web"],
  title: ["title", "jobtitle", "position", "role"],
  city: ["city", "location", "town"],
  note: ["note", "notes", "personalization", "personalisation", "hook", "context", "comment", "comments"],
};

const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Best-effort column mapping from header names. Exact alias match wins; first column wins ties. */
export function detectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<number>();
  for (const field of Object.keys(HEADER_ALIASES) as LeadField[]) {
    const idx = headers.findIndex((h, i) => !used.has(i) && HEADER_ALIASES[field].includes(normHeader(h)));
    if (idx !== -1) { mapping[field] = idx; used.add(idx); }
  }
  return mapping;
}

// Shared/role inboxes: replies go to a team, not a person, and cold mail to
// them has the worst complaint rate. Accepted but flagged in the preview.
const ROLE_LOCAL_PARTS = new Set([
  "info", "hello", "hi", "contact", "sales", "team", "support", "admin", "office", "mail",
  "enquiries", "inquiries", "press", "media", "hr", "jobs", "careers", "marketing", "billing",
  "accounts", "noreply", "no-reply", "donotreply", "webmaster", "postmaster", "abuse", "help",
  "service", "orders", "booking", "bookings", "reception", "general", "newsletter",
]);

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export const normalizeEmail = (raw: string) => raw.trim().replace(/^mailto:/i, "").replace(/[<>"']/g, "").toLowerCase();

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email) && !email.includes("..");
}

// RFC 2606 / 6761 reserved names: they can never receive mail, and the sample
// CSV uses them on purpose so uploading it unchanged cannot email anyone.
const RESERVED_TLDS = new Set(["test", "invalid", "localhost", "example"]);
const RESERVED_DOMAINS = ["example.com", "example.org", "example.net"];

export function isReservedDomain(email: string): boolean {
  const domain = email.split("@")[1] ?? "";
  const tld = domain.split(".").pop() ?? "";
  return RESERVED_TLDS.has(tld) || RESERVED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export function isRoleAddress(email: string): boolean {
  return ROLE_LOCAL_PARTS.has((email.split("@")[0] ?? "").split("+")[0]);
}

/** Origin-only website ("acme.com" / "https://www.acme.com/x" -> "https://acme.com"), or "" when unusable. */
export function normalizeWebsite(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (!u.hostname.includes(".")) return "";
    return `https://${u.hostname.replace(/^www\./i, "").toLowerCase()}`;
  } catch {
    return "";
  }
}

const clean = (v: string | undefined, max: number) => (v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const titleCase = (s: string) => s.replace(/\b([a-z])([a-z']*)/g, (_m, a, b) => a.toUpperCase() + b);

export interface Lead {
  email: string;
  first_name: string;
  last_name: string;
  company: string;
  website: string;
  title: string;
  city: string;
  note: string;
  role_address: boolean;
}

export interface RejectedRow {
  /** 1-based line number in the file, counting the header as line 1. */
  line: number;
  reason: "missing_email" | "invalid_email";
  value: string;
}

/** Turns parsed rows (header excluded) into leads using the column mapping. */
export function buildLeads(rows: string[][], mapping: ColumnMapping): { leads: Lead[]; rejected: RejectedRow[] } {
  const leads: Lead[] = [];
  const rejected: RejectedRow[] = [];
  const get = (r: string[], f: LeadField) => (mapping[f] === undefined ? "" : (r[mapping[f]!] ?? ""));

  rows.forEach((r, i) => {
    const line = i + 2;
    const rawEmail = get(r, "email");
    if (!rawEmail.trim()) { rejected.push({ line, reason: "missing_email", value: "" }); return; }
    const email = normalizeEmail(rawEmail);
    if (!isValidEmail(email) || isReservedDomain(email)) { rejected.push({ line, reason: "invalid_email", value: clean(rawEmail, 80) }); return; }

    let first = clean(get(r, "first_name"), 60);
    let last = clean(get(r, "last_name"), 60);
    const full = clean(get(r, "full_name"), 120);
    if (!first && full) {
      const parts = full.split(" ");
      first = parts[0] ?? "";
      if (!last) last = parts.slice(1).join(" ");
    }
    if (first && first === first.toLowerCase()) first = titleCase(first);

    leads.push({
      email,
      first_name: first,
      last_name: last,
      company: clean(get(r, "company"), 120),
      website: normalizeWebsite(get(r, "website")),
      title: clean(get(r, "title"), 100),
      city: clean(get(r, "city"), 80),
      note: clean(get(r, "note"), 300),
      role_address: isRoleAddress(email),
    });
  });
  return { leads, rejected };
}

export interface ImportSummary {
  total_rows: number;
  accepted: number;
  invalid: number;
  duplicates_in_file: number;
  already_in_pipeline: number;
  unsubscribed: number;
  bounced: number;
  role_addresses: number;
  without_first_name: number;
}

/**
 * Splits leads into those we will import and the reasons the rest are skipped.
 * `existing`, `unsubscribed`, `bounced` are lowercase email sets from the DB.
 */
export function classifyLeads(
  leads: Lead[],
  rejected: RejectedRow[],
  suppress: { existing: Set<string>; unsubscribed: Set<string>; bounced: Set<string> },
): { accepted: Lead[]; summary: ImportSummary } {
  const seen = new Set<string>();
  const accepted: Lead[] = [];
  const summary: ImportSummary = {
    total_rows: leads.length + rejected.length,
    accepted: 0,
    invalid: rejected.length,
    duplicates_in_file: 0,
    already_in_pipeline: 0,
    unsubscribed: 0,
    bounced: 0,
    role_addresses: 0,
    without_first_name: 0,
  };

  for (const lead of leads) {
    if (seen.has(lead.email)) { summary.duplicates_in_file++; continue; }
    seen.add(lead.email);
    // Opt-outs and bounces outrank "already a prospect": report the stronger reason.
    if (suppress.unsubscribed.has(lead.email)) { summary.unsubscribed++; continue; }
    if (suppress.bounced.has(lead.email)) { summary.bounced++; continue; }
    if (suppress.existing.has(lead.email)) { summary.already_in_pipeline++; continue; }
    accepted.push(lead);
    if (lead.role_address) summary.role_addresses++;
    if (!lead.first_name) summary.without_first_name++;
  }
  summary.accepted = accepted.length;
  return { accepted, summary };
}

/** Whole days needed to send `emails` at `dailyCap` per day (at least 1 when there is anything to send). */
export function estimateSendDays(emails: number, dailyCap: number): number {
  if (emails <= 0) return 0;
  return Math.max(1, Math.ceil(emails / Math.max(1, dailyCap)));
}

/** prospects.name is NOT NULL and holds the company/display name. */
export function prospectDisplayName(lead: Lead): string {
  if (lead.company) return lead.company;
  const full = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
  if (full) return full;
  return lead.email.split("@")[1] ?? lead.email;
}

const hostOf = (url: string): string => {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
};

/**
 * prospects has a UNIQUE (client_id, website_url) for non-empty URLs, but a
 * list routinely has several people at one company. Keep the website on the
 * first lead per company only (and none if the company is already a prospect);
 * everyone else gets "" so they import instead of colliding.
 */
export function assignWebsites(leads: Lead[], existingWebsiteUrls: string[]): Map<string, string> {
  const used = new Set(existingWebsiteUrls.map(hostOf).filter(Boolean));
  const out = new Map<string, string>();
  for (const lead of leads) {
    const host = lead.website ? hostOf(lead.website) : "";
    if (host && !used.has(host)) {
      used.add(host);
      out.set(lead.email, lead.website);
    } else {
      out.set(lead.email, "");
    }
  }
  return out;
}

/**
 * The prospects row for an imported lead. Imported leads skip discovery,
 * enrichment and fit scoring (the client chose them) and go straight to
 * 'pending' with an approval stamp: the drip's existing 48h hold before first
 * contact is the window to pause or cancel the campaign.
 */
export function leadToProspectRow(
  lead: Lead,
  ctx: { clientId: string; campaignId: string; website: string; approvedAt: string; approvedBy: string },
): Record<string, unknown> {
  return {
    client_id: ctx.clientId,
    campaign_id: ctx.campaignId,
    name: prospectDisplayName(lead),
    email: lead.email,
    website_url: ctx.website,
    phone: null,
    city: lead.city || null,
    source: "outbound",
    status: "pending",
    approved_at: ctx.approvedAt,
    approved_by: ctx.approvedBy,
    contact_first_name: lead.first_name || null,
    contact_last_name: lead.last_name || null,
    contact_title: lead.title || null,
    personalization_hook: lead.note || null,
    research_snapshot: { via: "csv_import" },
  };
}
