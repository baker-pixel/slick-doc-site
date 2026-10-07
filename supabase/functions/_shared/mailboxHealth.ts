import { logAlert } from "./alerts.ts";

// A mailbox that connects but never receives anything is indistinguishable
// from a quiet one at the poll level -- Innermetrix's sending domain had no MX
// record for weeks, so every reply vanished while each poll returned a clean
// "0 messages". These checks turn that into an alert.

export interface PollRunRow {
  ok: boolean;
  messages_seen: number;
  finished_at: string;
  error: string | null;
}

export type MailboxVerdict =
  | { status: "unknown" }
  | { status: "healthy" }
  | { status: "failing"; reason: string }
  | { status: "silent"; reason: string };

export const FAILING_AFTER_RUNS = 3;
// A mailbox must have been watched for this long, with zero messages in every
// poll, before "quiet" becomes "suspect".
export const SILENT_WINDOW_HOURS = 48;
// ...and only if we've been sending real outreach, otherwise an empty inbox is
// the expected state (a client who has sent nothing has nothing to reply to).
export const MIN_OUTREACH_FOR_SILENT = 5;

/**
 * Pure verdict from recent poll runs (newest first) and how much outreach this
 * client sent recently.
 */
export function evaluateMailbox(
  runsNewestFirst: PollRunRow[],
  outreachSentLast7d: number,
  now: Date = new Date(),
): MailboxVerdict {
  if (runsNewestFirst.length === 0) return { status: "unknown" };

  const latest = runsNewestFirst.slice(0, FAILING_AFTER_RUNS);
  if (latest.length === FAILING_AFTER_RUNS && latest.every((r) => !r.ok)) {
    return { status: "failing", reason: latest[0].error ?? "polling failed" };
  }

  const windowStart = now.getTime() - SILENT_WINDOW_HOURS * 3_600_000;
  const inWindow = runsNewestFirst.filter((r) => Date.parse(r.finished_at) >= windowStart);
  // Need runs spanning most of the window, otherwise we simply haven't watched long enough.
  const oldest = inWindow.length ? Math.min(...inWindow.map((r) => Date.parse(r.finished_at))) : now.getTime();
  const watchedMs = now.getTime() - oldest;
  const watchedLongEnough = watchedMs >= (SILENT_WINDOW_HOURS - 1) * 3_600_000;
  const sawNothing = inWindow.length > 0 && inWindow.every((r) => r.ok && r.messages_seen === 0);
  if (watchedLongEnough && sawNothing && outreachSentLast7d >= MIN_OUTREACH_FOR_SILENT) {
    return {
      status: "silent",
      reason: `inbox returned no messages for ${SILENT_WINDOW_HOURS}h despite ${outreachSentLast7d} outreach emails sent in the last 7 days`,
    };
  }
  return { status: "healthy" };
}

export type MxResult =
  | { status: "ok"; hosts: string[] }
  | { status: "none" } // domain exists but publishes no MX
  | { status: "error"; error: string }; // lookup itself failed -- say nothing about the domain

/**
 * MX lookup over DNS-over-HTTPS (the edge runtime has no raw DNS). A failed
 * lookup is reported as "error", never as "none", so a resolver hiccup can't
 * raise a false "no MX record" alarm.
 */
export async function lookupMx(
  domain: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MxResult> {
  try {
    const res = await fetchImpl(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
      { headers: { accept: "application/dns-json" } },
    );
    if (!res.ok) return { status: "error", error: `DNS lookup HTTP ${res.status}` };
    const json = await res.json() as { Status?: number; Answer?: { type: number; data: string }[] };
    // Status 0 = NOERROR; 3 = NXDOMAIN. Anything else (SERVFAIL...) is a resolver problem.
    if (json.Status !== 0 && json.Status !== 3) return { status: "error", error: `DNS status ${json.Status}` };
    const hosts = (json.Answer ?? [])
      .filter((a) => a.type === 15)
      .map((a) => a.data.trim().split(/\s+/).pop()!.replace(/\.$/, ""))
      .filter(Boolean);
    return hosts.length ? { status: "ok", hosts } : { status: "none" };
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : "DNS lookup failed" };
  }
}

export function domainOf(address: string | null | undefined): string | null {
  const d = address?.split("@")[1]?.trim().toLowerCase();
  return d || null;
}

const ALERT_TYPE = "mailbox_unhealthy";

/**
 * Evaluates one mailbox from its recorded poll runs, and raises (once per day)
 * or clears the matching admin alert. Never throws.
 */
export async function checkMailboxHealth(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  clientId: string,
  fromAddress: string | null,
  deps: { lookupMx?: typeof lookupMx } = {},
): Promise<MailboxVerdict> {
  try {
    const { data: runs } = await supabase
      .from("poll_runs")
      .select("ok, messages_seen, finished_at, error")
      .eq("client_id", clientId)
      .order("finished_at", { ascending: false })
      .limit(200);

    const since = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
    const { count: sent } = await supabase
      .from("email_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("sent_at", since)
      .filter("metadata->>client_id", "eq", clientId);

    const verdict = evaluateMailbox((runs ?? []) as PollRunRow[], sent ?? 0);

    const { data: open } = await supabase
      .from("automation_alerts")
      .select("id")
      .eq("alert_type", ALERT_TYPE)
      .eq("source_id", clientId)
      .is("acknowledged_at", null)
      .limit(1)
      .maybeSingle();

    if (verdict.status === "healthy") {
      // Recovered: close the alert so the dashboard only shows live problems.
      if (open) {
        await supabase.from("automation_alerts").update({ acknowledged_at: new Date().toISOString() }).eq("id", open.id);
      }
      return verdict;
    }

    if ((verdict.status === "failing" || verdict.status === "silent") && !open) {
      let detail = verdict.reason;
      const domain = domainOf(fromAddress);
      if (verdict.status === "silent" && domain) {
        // Diagnose the usual cause so the alert says what to fix, not just
        // that something is wrong.
        const mx = await (deps.lookupMx ?? lookupMx)(domain);
        if (mx.status === "none") {
          detail = `${detail}. ${domain} has no MX record, so replies cannot be delivered -- add one at the domain's DNS provider.`;
        } else if (mx.status === "ok") {
          detail = `${detail}. ${domain} does have MX records (${mx.hosts.slice(0, 2).join(", ")}), so check the IMAP host/credentials and that mail lands in INBOX.`;
        }
      }
      await logAlert(supabase, {
        source: "poll-client-mailboxes",
        alertType: ALERT_TYPE,
        severity: "error",
        title: verdict.status === "failing" ? "Client mailbox polling is failing" : "Client mailbox looks dead (receiving nothing)",
        message: detail,
        sourceId: clientId,
        metadata: { client_id: clientId, verdict: verdict.status },
      });
    }
    return verdict;
  } catch (e) {
    console.error(`[mailboxHealth] ${clientId}:`, e instanceof Error ? e.message : e);
    return { status: "unknown" };
  }
}
