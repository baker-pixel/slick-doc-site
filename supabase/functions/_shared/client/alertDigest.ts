// Pure helper for the check-alerts digest email.

export interface DigestAlert {
  id: string;
  title: string;
  message: string;
  source: string;
  created_at: string;
  // deno-lint-ignore no-explicit-any
  metadata: any;
}

export interface DigestGroup<T extends DigestAlert = DigestAlert> {
  /** The newest alert in the group, used for display. */
  alert: T;
  /** How many identical alerts were collapsed into this one. */
  count: number;
}

/**
 * Collapses alerts that describe the same problem (same source, title, message,
 * client and post) into one row with a count, newest first. One failing post
 * used to render as N identical rows and inflate the "N errors" headline.
 * Expects `alerts` newest-first, as the digest query returns them.
 */
export function groupAlerts<T extends DigestAlert>(alerts: T[]): DigestGroup<T>[] {
  const groups = new Map<string, DigestGroup<T>>();
  for (const a of alerts) {
    const key = [
      a.source,
      a.title,
      a.message,
      a.metadata?.client_account_id ?? a.metadata?.client_id ?? "",
      a.metadata?.title ?? "",
      a.metadata?.platform ?? "",
    ].join("\u0001");
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { alert: a, count: 1 });
  }
  return [...groups.values()];
}

/**
 * Severities that reach the digest email. `warning` and `info` stay in the
 * admin panel only. `high` and `critical` MUST be here: stripe-webhook writes
 * a duplicate-payment alert as `critical`, and check-stalled-workflows writes
 * every stuck-work alert as `high`; an error-only filter never emailed them.
 */
export const DIGEST_SEVERITIES = ["error", "high", "critical"] as const;

export function severityColor(severity: string): string {
  return severity === "critical" || severity === "error" ? "#DC2626" : "#D97706";
}

/** A pg_cron job that has not started within twice its expected gap. */
export interface StaleCronJob {
  jobname: string;
  schedule: string;
  /** ISO timestamp of the newest run, or null when the job never ran. */
  last_run: string | null;
  /** Postgres interval text, e.g. "01:00:00" or "1 day". */
  expected_gap: string;
}

export const STALE_CRON_SOURCE = "cron-staleness";

/** The alert raised for one stale job. Title is the dedupe key. */
export function staleJobAlert(job: StaleCronJob): { title: string; message: string } {
  const last = job.last_run ? new Date(job.last_run).toUTCString() : "never (since run history began)";
  return {
    title: `Cron job "${job.jobname}" has stopped running`,
    message:
      `Schedule "${job.schedule}" should start about every ${job.expected_gap}; last start: ${last}. ` +
      `Check cron.job (active flag) and cron.job_run_details.`,
  };
}
