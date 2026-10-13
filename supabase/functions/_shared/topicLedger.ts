// Topic ledger for the social agent. Every filled post records what it was
// actually ABOUT (metadata.topic) and which pillar it served (metadata.pillar)
// on its content_calendar row, so the next draft -- this week or next cycle --
// can avoid repeats and rotate pillars from real history.
//
// Calendar titles ("LinkedIn Post — Oct 13, 2026") are slot labels, not topics,
// so they are never used as repetition memory.

/** How many past topics the generator is told to steer away from. */
export const RECENT_TOPIC_LIMIT = 30;

const PLACEHOLDER_TITLE = /^(linkedin|facebook|instagram|twitter|google|blog|email)[a-z ]* (post|update|newsletter)\s+[—-]/i;

export function isPlaceholderTitle(title: string | null | undefined): boolean {
  return !title || PLACEHOLDER_TITLE.test(title.trim());
}

/** The best human-readable topic for a row: ledger topic, else a real title, else null. */
export function topicOf(row: { title?: string | null; metadata?: any }): string | null {
  const t = row.metadata?.topic;
  if (typeof t === "string" && t.trim()) return t.trim();
  return isPlaceholderTitle(row.title) ? null : (row.title as string).trim();
}

/** Newest-first rows -> distinct topics, capped. Case/punctuation-insensitive dedupe. */
export function collectRecentTopics(
  rows: Array<{ title?: string | null; metadata?: any }>,
  limit = RECENT_TOPIC_LIMIT,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const topic = topicOf(r);
    if (!topic) continue;
    const key = topic.toLowerCase().replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(topic);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Least-recently-over-used pillar: the pillar with the fewest recent posts
 * wins; ties go to the earlier pillar. Replaces a per-run cursor that always
 * restarted at pillar 0, which starved later pillars across runs.
 */
export function pickPillar(pillars: string[], recentPillars: Array<string | null | undefined>): string | undefined {
  if (pillars.length === 0) return undefined;
  const counts = new Map<string, number>(pillars.map((p) => [p, 0]));
  for (const p of recentPillars) {
    if (p && counts.has(p)) counts.set(p, counts.get(p)! + 1);
  }
  let best = pillars[0];
  for (const p of pillars) if (counts.get(p)! < counts.get(best)!) best = p;
  return best;
}

const topicKey = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();

/** Topics that appear more than once in a set of rows (quality check: a cycle should not repeat itself). */
export function findRepeatedTopics(rows: Array<{ title?: string | null; metadata?: any }>): string[] {
  const counts = new Map<string, { topic: string; n: number }>();
  for (const r of rows) {
    const t = topicOf(r);
    const k = t ? topicKey(t) : "";
    if (!k) continue;
    const e = counts.get(k);
    if (e) e.n++; else counts.set(k, { topic: t!, n: 1 });
  }
  return [...counts.values()].filter((e) => e.n > 1).map((e) => e.topic);
}
