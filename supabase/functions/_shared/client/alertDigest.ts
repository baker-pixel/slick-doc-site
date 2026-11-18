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
