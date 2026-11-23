// Pure helpers for the "interested, no reply" list (client_warm_leads RPC).

export interface WarmLead {
  id: string;
  name: string;
  email: string | null;
  website_url: string;
  business_type: string | null;
  clicked_at: string;
  last_sent_at: string | null;
  emails_sent: number;
}

/**
 * Guard against spreadsheet formula injection: a cell that starts with = + - @
 * (or a tab/CR) is executed as a formula when the CSV is opened in Excel/Sheets.
 * Company names and websites come from third-party data, so treat them as untrusted.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const HEADER = ["Company", "Email", "Website", "Type", "Emails sent", "Last email", "Clicked"];

/** CSV text for the warm list; dates are ISO dates (UTC) so the file reads the same everywhere. */
export function warmLeadsCsv(leads: WarmLead[]): string {
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
  const rows = leads.map((l) =>
    [l.name, l.email ?? "", l.website_url, l.business_type ?? "", l.emails_sent, day(l.last_sent_at), day(l.clicked_at)].map(csvCell).join(","),
  );
  return [HEADER.map(csvCell).join(","), ...rows].join("\r\n");
}
