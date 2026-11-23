// Memory for Apollo company discovery. See migration 20261124100000.
//
// Two ideas, both aimed at not paying Apollo (1 credit per page) for companies
// the client already has:
//   1. Tell Apollo up front which domains to skip (not_organization_websites_list),
//      built from what we already hold, so page 1 is fresh instead of the same
//      top-ranked companies every day.
//   2. Remember when a search keeps coming back with nothing new and let it rest,
//      so the call budget goes to searches that can still produce leads.

/** A search that finds nothing new this many runs in a row is rested. */
export const EXHAUSTED_AFTER_EMPTY_RUNS = 2;
/** How long a dry search rests before it is tried again (new companies appear in Apollo over time). */
export const EXHAUSTION_COOLDOWN_DAYS = 30;
/** Cap on domains sent to Apollo as an exclusion list; the local dedupe still covers the rest. */
export const MAX_EXCLUDED_DOMAINS = 500;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SearchStateRow {
  client_id: string;
  search_key: string;
  label: string;
  runs: number;
  total_found: number;
  total_fresh: number;
  last_found: number;
  last_fresh: number;
  consecutive_empty: number;
  exhausted_until: string | null;
  last_run_at: string;
}

export interface SearchOutcome {
  /** Companies Apollo returned for this search this run (after dropping non-prospect domains). */
  found: number;
  /** Of those, how many were not already known to this client. */
  fresh: number;
}

/** Bare registrable-looking host: no scheme, no "www.", no path, lower-case. "" when unparseable. */
export function toBareDomain(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    return host.includes(".") ? host : "";
  } catch {
    return "";
  }
}

/**
 * Domains to exclude at Apollo: unique, bare, most-recent-first as given, capped.
 * Input order is preserved so callers can pass newest first and keep the freshest memory.
 */
export function buildExcludeList(urls: Iterable<string | null | undefined>, cap = MAX_EXCLUDED_DOMAINS): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of urls) {
    const d = toBareDomain(u);
    if (!d || seen.has(d)) continue;
    seen.add(d);
    out.push(d);
    if (out.length >= cap) break;
  }
  return out;
}

/** Stable identity of a search: the same tags/location/size always map to the same key. */
export async function searchKey(tags: string[], geography: string, employeeRange?: string): Promise<string> {
  const canon = JSON.stringify({
    t: [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].sort(),
    g: (geography ?? "").trim().toLowerCase(),
    s: employeeRange ?? "",
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canon));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** True while a search is resting and should not be run. */
export function isResting(row: Pick<SearchStateRow, "exhausted_until"> | undefined | null, now: Date = new Date()): boolean {
  if (!row?.exhausted_until) return false;
  return new Date(row.exhausted_until).getTime() > now.getTime();
}

/**
 * The row after one more run. Pure so the rule is easy to test:
 * a run with fresh companies resets the streak; EXHAUSTED_AFTER_EMPTY_RUNS empty
 * runs in a row start a cooldown (and restart the streak, so it gets a clean try after resting).
 */
export function applyOutcome(
  prev: SearchStateRow | undefined,
  base: { client_id: string; search_key: string; label: string },
  outcome: SearchOutcome,
  now: Date = new Date(),
): SearchStateRow {
  const empty = outcome.fresh <= 0;
  let consecutiveEmpty = empty ? (prev?.consecutive_empty ?? 0) + 1 : 0;
  let exhaustedUntil: string | null = null;
  if (empty && consecutiveEmpty >= EXHAUSTED_AFTER_EMPTY_RUNS) {
    exhaustedUntil = new Date(now.getTime() + EXHAUSTION_COOLDOWN_DAYS * DAY_MS).toISOString();
    consecutiveEmpty = 0;
  }
  return {
    ...base,
    runs: (prev?.runs ?? 0) + 1,
    total_found: (prev?.total_found ?? 0) + outcome.found,
    total_fresh: (prev?.total_fresh ?? 0) + outcome.fresh,
    last_found: outcome.found,
    last_fresh: outcome.fresh,
    consecutive_empty: consecutiveEmpty,
    exhausted_until: exhaustedUntil,
    last_run_at: now.toISOString(),
  };
}

// deno-lint-ignore no-explicit-any
type Supa = any;

/** All search rows for a client, keyed by search_key. Failure to read is non-fatal: nothing rests. */
export async function loadSearchState(supabase: Supa, clientId: string): Promise<Map<string, SearchStateRow>> {
  const map = new Map<string, SearchStateRow>();
  try {
    const { data, error } = await supabase.from("apollo_search_state").select("*").eq("client_id", clientId);
    if (error) throw error;
    for (const r of (data ?? []) as SearchStateRow[]) map.set(r.search_key, r);
  } catch (e) {
    console.warn("apollo_search_state load failed (continuing without it):", e instanceof Error ? e.message : e);
  }
  return map;
}

/** Persist outcomes. Best effort: a failure must never fail discovery. */
export async function saveSearchState(supabase: Supa, rows: SearchStateRow[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const { error } = await supabase.from("apollo_search_state").upsert(rows, { onConflict: "client_id,search_key" });
    if (error) throw error;
  } catch (e) {
    console.warn("apollo_search_state save failed:", e instanceof Error ? e.message : e);
  }
}
