// Is there anyone reachable at this company? Checked BEFORE a discovered company
// becomes a lead.
//
// Most dead-end leads are companies Apollo has no people for ("no_decision_maker":
// Orange Door 26 of 28 stuck leads). They used to be inserted, site-scanned and
// fit-scored first and only then found to be unreachable. Apollo's people search
// costs 0 credits (docs: "Credit usage: 0 credits") and returns no emails, so asking
// it up front is free and removes them before any other cost is spent.
//
// Fails open: any error, rate limit or unexpected response means "unknown", and an
// unknown company is never dropped -- the existing email lookup still runs later.

const APOLLO_API = "https://api.apollo.io/api/v1";

/** Same seniority ladder the email enrichment ends up using, in one call. */
const SENIORITIES = ["owner", "founder", "c_suite", "partner", "vp", "head", "director", "manager", "senior"];

export type ContactStatus = "reachable" | "no_people" | "no_email_on_file" | "unknown";

export interface ContactCheck {
  status: ContactStatus;
  people: number;
  /** True when Apollo said 429: callers should stop checking for this run. */
  rateLimited?: boolean;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export async function checkApolloContacts(
  apolloKey: string,
  domain: string,
  fetchFn: FetchLike = fetch,
): Promise<ContactCheck> {
  if (!domain) return { status: "unknown", people: 0 };
  try {
    const res = await fetchFn(`${APOLLO_API}/mixed_people/api_search`, {
      method: "POST",
      headers: { "x-api-key": apolloKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        q_organization_domains_list: [domain],
        person_seniorities: SENIORITIES,
        per_page: 3,
        page: 1,
      }),
    });
    if (res.status === 429) {
      await res.body?.cancel().catch(() => {});
      return { status: "unknown", people: 0, rateLimited: true };
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return { status: "unknown", people: 0 };
    }
    const data = await res.json();
    if (!Array.isArray(data?.people)) return { status: "unknown", people: 0 };
    const people = (data.people as { id?: string; has_email?: boolean }[]).filter((p) => p?.id);
    if (people.length === 0) return { status: "no_people", people: 0 };
    // has_email is reported by the search response; if the field is absent we cannot
    // tell, so treat the company as reachable rather than guess.
    const known = people.filter((p) => typeof p.has_email === "boolean");
    if (known.length === people.length && known.every((p) => p.has_email === false)) {
      return { status: "no_email_on_file", people: people.length };
    }
    return { status: "reachable", people: people.length };
  } catch {
    return { status: "unknown", people: 0 };
  }
}

export interface Candidate {
  website_url: string;
}

export interface Selection<T> {
  /** Companies to insert, reachable ones first, then unchecked ones, up to the batch size. */
  chosen: T[];
  /** Companies confirmed unreachable: not inserted, remembered so they are not re-found. */
  rejected: { item: T; status: ContactStatus }[];
  checks: number;
  rateLimited: boolean;
}

export interface SelectOptions {
  /** Simultaneous Apollo lookups. */
  concurrency?: number;
  /** Hard cap on lookups this run. */
  maxChecks?: number;
}

/**
 * Fill a batch of `quota` with reachable companies. Candidates are checked in order,
 * in small parallel groups, until the quota of reachable ones is met, the check budget
 * runs out, or Apollo rate-limits us. Unchecked candidates fill any remaining space
 * (fail open) so a flaky lookup never leaves a client with nothing.
 */
export async function selectReachable<T extends Candidate>(
  candidates: T[],
  quota: number,
  check: (item: T) => Promise<ContactCheck>,
  opts: SelectOptions = {},
): Promise<Selection<T>> {
  const concurrency = Math.max(1, opts.concurrency ?? 5);
  const maxChecks = opts.maxChecks ?? 60;
  const reachable: T[] = [];
  const rejected: Selection<T>["rejected"] = [];
  const unknown: T[] = [];
  let checks = 0;
  let rateLimited = false;
  let next = 0;

  while (next < candidates.length && reachable.length < quota && checks < maxChecks && !rateLimited) {
    const room = Math.min(concurrency, maxChecks - checks, candidates.length - next);
    const group = candidates.slice(next, next + room);
    next += room;
    checks += room;
    const outcomes = await Promise.all(group.map((item) => check(item)));
    group.forEach((item, i) => {
      const o = outcomes[i];
      if (o.rateLimited) rateLimited = true;
      if (o.status === "reachable") reachable.push(item);
      else if (o.status === "unknown") unknown.push(item);
      else rejected.push({ item, status: o.status });
    });
  }

  const untouched = candidates.slice(next);
  const chosen = [...reachable, ...unknown, ...untouched].slice(0, quota);
  return { chosen, rejected, checks, rateLimited };
}
