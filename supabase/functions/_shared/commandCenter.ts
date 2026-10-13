// Brains of the admin Command Center: what jobs exist, how to say them in plain
// English, whether a scheduled job is healthy, and what needs the owner's
// attention. Pure functions (no I/O) so they are unit-tested; the edge function
// feeds them the output of command_center_overview() and renders the result.

export type JobGroup = "social" | "prospects" | "insights" | "platform";

export interface JobDef {
  key: string;
  label: string;
  description: string;
  group: JobGroup;
  /** "client" jobs need a client_id; "global" jobs act on every client that is due. */
  scope: "client" | "global";
  /** Edge function that does the work. Only names listed here can ever be invoked. */
  fn: string;
  /** Request body for the function. */
  body: (clientId?: string) => Record<string, unknown>;
  /** Call repeatedly until the function reports nothing left (each call is time-boxed). */
  loop?: { maxCalls: number };
  /** Shown in a confirmation box first, for jobs with real-world side effects. */
  confirm?: string;
}

export const JOBS: Record<string, JobDef> = {
  build_cycle: {
    key: "build_cycle", group: "social", scope: "client", fn: "start-client-cycle",
    label: "Plan this cycle",
    description: "Builds the month's plan: learns from last cycle, sets the content strategy, fills the post calendar and searches for new prospects.",
    body: (c) => ({ client_id: c, trigger: "manual" }),
  },
  replan_cycle: {
    key: "replan_cycle", group: "social", scope: "client", fn: "start-client-cycle",
    label: "Re-plan from scratch",
    description: "Re-runs every planning step even if the cycle already ran. Uses AI and prospect-search credits again.",
    body: (c) => ({ client_id: c, trigger: "manual", force: true }),
    confirm: "This re-runs the whole cycle plan, including a fresh prospect search. It costs AI and Apollo credits. Continue?",
  },
  schedule_posts: {
    key: "schedule_posts", group: "social", scope: "client", fn: "auto-schedule-content",
    label: "Fill the post calendar",
    description: "Creates empty post slots for the rest of the cycle, across the client's connected accounts.",
    body: (c) => ({ client_id: c }),
  },
  write_captions: {
    key: "write_captions", group: "social", scope: "client", fn: "fill-scheduled-content",
    label: "Write the captions",
    description: "AI writes every empty post slot, then sends the drafts to the client's Approvals tab and starts image generation.",
    body: (c) => ({ client_id: c, limit: 4 }),
    loop: { maxCalls: 8 },
  },
  find_prospects: {
    key: "find_prospects", group: "prospects", scope: "client", fn: "discover-prospects-web",
    label: "Find new prospects",
    description: "Searches for new companies that match this client's ideal customer. Does not email anyone.",
    body: (c) => ({ client_id: c }),
  },
  seo_audit: {
    key: "seo_audit", group: "insights", scope: "client", fn: "seo-audit",
    label: "Run SEO audit",
    description: "Crawls the client's website and scores its search and AI-readiness, with a list of fixes.",
    body: (c) => ({ client_id: c }),
  },
  enrich_prospects: {
    key: "enrich_prospects", group: "prospects", scope: "global", fn: "backfill-prospect-context",
    label: "Find prospect emails",
    description: "Scans new prospects' websites, scores how well they fit, and looks up a verified work email. Uses Apollo credits.",
    body: () => ({}),
  },
  run_drip: {
    key: "run_drip", group: "prospects", scope: "global", fn: "run-prospect-drip",
    label: "Draft outreach emails",
    description: "For prospects you approved, writes their email sequence and queues it. Nothing is sent until the send job runs.",
    body: () => ({}),
  },
  send_emails: {
    key: "send_emails", group: "prospects", scope: "global", fn: "process-email-queue",
    label: "Send queued emails now",
    description: "Sends every email that is due from the clients' own mailboxes.",
    body: () => ({}),
    confirm: "This sends real emails to real people from the clients' mailboxes. Continue?",
  },
  publish_posts: {
    key: "publish_posts", group: "social", scope: "global", fn: "publish-scheduled-content",
    label: "Publish due posts now",
    description: "Publishes every approved post whose time has come, to the client's social accounts.",
    body: () => ({}),
    confirm: "This publishes approved posts to live social accounts right now. Continue?",
  },
  check_images: {
    key: "check_images", group: "social", scope: "global", fn: "check-image-batches",
    label: "Collect finished images",
    description: "Pulls completed images from OpenAI and attaches them to posts.",
    body: () => ({}),
  },
  probe_visibility: {
    key: "probe_visibility", group: "insights", scope: "global", fn: "run-ai-visibility-probes",
    label: "Check AI visibility",
    description: "Asks ChatGPT and Claude category questions to see if each client is recommended. Only clients that are due are checked.",
    body: () => ({}),
  },
};

/** What each scheduled job is, in plain English, and which button re-runs it. */
export const CRON_INFO: Record<string, { label: string; what: string; run?: string }> = {
  "process-agent-jobs": { label: "Agent job queue", what: "Works through background AI jobs waiting in line." },
  "check-alerts": { label: "Alert watcher", what: "Looks for problems across the platform and raises alerts." },
  "check-image-batches": { label: "Collect finished images", what: "Attaches images OpenAI has finished to their posts.", run: "check_images" },
  "sync-fill-missing-images": { label: "Make missing images", what: "Generates an image directly for any post still missing one close to its publish time." },
  "check-stalled-workflows": { label: "Stalled onboarding check", what: "Nudges client onboarding steps that have stopped moving." },
  "poll-client-mailboxes": { label: "Read prospect replies", what: "Checks each client's mailbox for replies and bounces." },
  "process-email-queue": { label: "Send emails", what: "Sends queued outreach and platform emails that are due.", run: "send_emails" },
  "publish-scheduled-content": { label: "Publish posts", what: "Publishes approved posts whose time has come.", run: "publish_posts" },
  "reconcile-postforme-posts": { label: "Confirm posts went live", what: "Double-checks with the social network that published posts really appeared." },
  "run-prospect-drip": { label: "Draft outreach emails", what: "Writes email sequences for approved prospects.", run: "run_drip" },
  "backfill-prospect-context": { label: "Find prospect emails", what: "Scores new prospects and looks up their verified emails.", run: "enrich_prospects" },
  "cycle-rollover-sweep": { label: "Start new work cycles", what: "Starts the next cycle for any client whose billing period has begun.", run: "build_cycle" },
  "auto-schedule-content": { label: "Weekly post calendar", what: "Tops up each client's empty post slots.", run: "schedule_posts" },
  "fill-scheduled-content": { label: "Write captions", what: "AI writes any empty post slot.", run: "write_captions" },
  "auto-discover-prospects": { label: "Daily prospect search", what: "Looks for new prospects for clients that are due." },
  "run-ai-visibility-probes": { label: "AI visibility check", what: "Tests whether ChatGPT and Claude recommend each client.", run: "probe_visibility" },
  "seo-reaudit-scan": { label: "SEO re-audit", what: "Re-audits client websites on their plan's schedule." },
  "client-context-refresh": { label: "Refresh client profiles", what: "Re-reads each client's website to keep their business profile current." },
  "daily-client-automation": { label: "Daily client tasks", what: "Runs the day's standard tasks for every client." },
  "weekly-client-reports": { label: "Weekly reports", what: "Builds weekly client reports." },
  "monthly-client-reports": { label: "Monthly reports", what: "Builds monthly client reports." },
  "weekly-portal-recap": { label: "Weekly client recap email", what: "Emails each client a summary of the week." },
  "send-approval-reminders": { label: "Approval reminders", what: "Reminds clients about posts waiting for their approval." },
  "detect-inactive-leads": { label: "Inactive lead check", what: "Flags leads that have gone quiet." },
  "sync-ga4-analytics": { label: "Pull website traffic", what: "Imports Google Analytics numbers for connected clients." },
  "cleanup-expired-draft-content": { label: "Clean up old drafts", what: "Deletes drafts for dates that have passed." },
  "cleanup-agent-job-dedupe": { label: "Housekeeping", what: "Clears old duplicate-protection records." },
  "report-failed-cron-http-calls": { label: "Failure reporter", what: "Raises an alert when a scheduled call is refused or crashes." },
};

export function titleCase(jobname: string): string {
  return jobname.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------- cron expressions (UTC) ----------

function expand(field: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const m = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
    if (!m) return null;
    const step = m[2] ? parseInt(m[2], 10) : 1;
    if (step < 1) return null;
    let lo = min, hi = max;
    if (m[1] !== "*") {
      const [a, b] = m[1].split("-");
      lo = parseInt(a, 10);
      hi = b !== undefined ? parseInt(b, 10) : m[2] ? max : lo;
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

interface ParsedCron { min: Set<number>; hour: Set<number>; dom: Set<number>; mon: Set<number>; dow: Set<number>; domAny: boolean; dowAny: boolean }

function parseCron(expr: string): ParsedCron | null {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return null;
  const [min, hour, dom, mon, dow] = [expand(f[0], 0, 59), expand(f[1], 0, 23), expand(f[2], 1, 31), expand(f[3], 1, 12), expand(f[4], 0, 7)];
  if (!min || !hour || !dom || !mon || !dow) return null;
  if (dow.has(7)) dow.add(0);
  return { min, hour, dom, mon, dow, domAny: f[2] === "*", dowAny: f[4] === "*" };
}

/** Next time (UTC) the expression fires strictly after `from`, or null if unparseable / not within ~13 months. */
export function nextRun(expr: string, from: Date): Date | null {
  const p = parseCron(expr);
  if (!p) return null;
  const d = new Date(from.getTime());
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(d.getUTCMinutes() + 1);
  const limit = from.getTime() + 400 * 86_400_000;
  while (d.getTime() <= limit) {
    if (!p.mon.has(d.getUTCMonth() + 1)) { d.setUTCMonth(d.getUTCMonth() + 1, 1); d.setUTCHours(0, 0, 0, 0); continue; }
    const dayOk = p.domAny && p.dowAny ? true
      : p.domAny ? p.dow.has(d.getUTCDay())
      : p.dowAny ? p.dom.has(d.getUTCDate())
      : p.dom.has(d.getUTCDate()) || p.dow.has(d.getUTCDay());
    if (!dayOk) { d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(0, 0, 0, 0); continue; }
    if (!p.hour.has(d.getUTCHours())) { d.setUTCHours(d.getUTCHours() + 1, 0, 0, 0); continue; }
    if (!p.min.has(d.getUTCMinutes())) { d.setUTCMinutes(d.getUTCMinutes() + 1); continue; }
    return d;
  }
  return null;
}

const DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const pad = (n: string | number) => String(n).padStart(2, "0");

export function describeSchedule(expr: string): string {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return expr;
  const [m, h, dom, mon, dow] = f;
  const isNum = (s: string) => /^\d+$/.test(s);
  const every = (s: string) => s.match(/^\*\/(\d+)$/)?.[1];

  if (m === "*" && h === "*" && dom === "*" && mon === "*" && dow === "*") return "Every minute";
  if (every(m) && h === "*" && dom === "*" && mon === "*" && dow === "*") return `Every ${every(m)} minutes`;
  if (isNum(m) && h === "*" && dom === "*" && mon === "*" && dow === "*") return `Every hour at :${pad(m)}`;
  if (isNum(m) && every(h) && dom === "*" && mon === "*" && dow === "*") return `Every ${every(h)} hours at :${pad(m)}`;
  if (isNum(m) && isNum(h) && mon === "*") {
    const at = `${pad(h)}:${pad(m)} UTC`;
    if (dom === "*" && dow === "*") return `Daily at ${at}`;
    if (dom === "*" && isNum(dow)) return `${DAYS[parseInt(dow, 10) % 7]} at ${at}`;
    if (isNum(dom) && dow === "*") return `Monthly on day ${dom} at ${at}`;
  }
  return expr;
}

/** How long the schedule normally goes between runs, in ms (null if unknown). */
export function expectedGapMs(expr: string, from: Date): number | null {
  const a = nextRun(expr, from);
  const b = a ? nextRun(expr, a) : null;
  return a && b ? b.getTime() - a.getTime() : null;
}

// ---------- job health ----------

export interface CronRow {
  jobname: string; schedule: string; active: boolean;
  last_start: string | null; last_end: string | null; last_status: string | null; last_message: string;
  fn: string | null;
}

export type CronState = "ok" | "late" | "failed" | "idle" | "paused";

export function cronHealth(job: CronRow, now: Date): { state: CronState; note: string } {
  if (!job.active) return { state: "paused", note: "Switched off" };
  const gap = expectedGapMs(job.schedule, now);
  if (!job.last_start) {
    // The overview only looks back 3 days; a weekly or monthly job simply may not have been due.
    return gap !== null && gap > 2 * 86_400_000
      ? { state: "idle", note: "Not due yet" }
      : { state: "late", note: "Has not fired in the last 3 days" };
  }
  if (job.last_status && job.last_status !== "succeeded") {
    return { state: "failed", note: job.last_message || "The last run failed" };
  }
  const age = now.getTime() - new Date(job.last_start).getTime();
  if (gap !== null && age > gap * 2 + 10 * 60_000) {
    return { state: "late", note: "Should have run more recently than this" };
  }
  return { state: "ok", note: "" };
}

// ---------- what needs attention ----------

export type Level = "critical" | "warning" | "info";
export interface AttentionItem {
  level: Level; title: string; detail: string;
  client_id?: string; client?: string;
  action?: { job: string; label: string; client_id?: string };
}

interface ClientBlock {
  id: string; name: string; status: string; subscription: string | null;
  payment_failed_at: string | null; paused_for_billing: boolean | null; website: string | null;
  cycle: { no: number; status: string; steps: Record<string, { status: string; detail?: string }> | null; issues: string[] | null } | null;
  social: { placeholders: number; held_for_admin: number; awaiting_client: number; failed: number; images_pending: number };
  prospects: { to_review: number; to_review_no_email: number };
  insights: { seo_score: number | null; seo_at: string | null };
  connections: { channels: string[]; mailbox: boolean };
  /** Upcoming posts per platform that has no connected account (so they cannot publish). */
  orphan_platforms?: Record<string, number>;
}

interface Overview {
  cron: CronRow[];
  failed_http_24h: { count: number; recent: Array<{ status: number | null; body: string }> };
  alerts: Array<{ severity: string; type: string; title: string; message: string }>;
  queues: { emails_failed_24h: number };
  clients: ClientBlock[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ORDER: Record<Level, number> = { critical: 0, warning: 1, info: 2 };

export function buildAttention(o: Overview, now: Date): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const j of o.cron) {
    const h = cronHealth(j, now);
    const name = (CRON_INFO[j.jobname]?.label) ?? titleCase(j.jobname);
    if (h.state === "failed") items.push({ level: "critical", title: `Scheduled job failed: ${name}`, detail: h.note });
    else if (h.state === "late") items.push({ level: "warning", title: `Scheduled job is late: ${name}`, detail: h.note });
  }

  if (o.failed_http_24h.count > 0) {
    const sample = o.failed_http_24h.recent[0];
    items.push({
      level: "warning",
      title: `${plural(o.failed_http_24h.count, "scheduled call")} ${o.failed_http_24h.count === 1 ? "was" : "were"} refused or crashed in the last 24 hours`,
      detail: sample ? `Most recent: HTTP ${sample.status ?? "no response"} ${sample.body}`.trim() : "",
    });
  }
  if (o.queues.emails_failed_24h > 0) {
    items.push({ level: "warning", title: `${plural(o.queues.emails_failed_24h, "email")} failed to send in the last 24 hours`, detail: "Check the client's mailbox connection." });
  }

  const seenAlert = new Set<string>();
  for (const a of o.alerts) {
    if (!["error", "critical"].includes(a.severity)) continue;
    const key = `${a.type}:${a.title}`;
    if (seenAlert.has(key)) continue;
    seenAlert.add(key);
    items.push({ level: "warning", title: a.title, detail: a.message });
    if (seenAlert.size >= 4) break;
  }

  for (const c of o.clients) {
    const who = { client_id: c.id, client: c.name };
    const live = c.subscription === "active" || c.subscription === "trialing";

    if (c.payment_failed_at || c.paused_for_billing) {
      items.push({ level: "critical", ...who, title: `${c.name}: payment problem`, detail: "Their last payment failed, so their agents are paused until it is fixed." });
      continue;
    }
    if (live && !c.cycle) {
      items.push({ level: "warning", ...who, title: `${c.name} has no work cycle yet`, detail: "They are paying, but no plan has been built.", action: { job: "build_cycle", label: "Plan this cycle", client_id: c.id } });
    }
    for (const [step, r] of Object.entries(c.cycle?.steps ?? {})) {
      if (r.status === "error") items.push({ level: "warning", ...who, title: `${c.name}: the "${step.replace(/_/g, " ")}" step failed`, detail: r.detail ?? "" });
    }
    for (const issue of c.cycle?.issues ?? []) items.push({ level: "warning", ...who, title: `${c.name}: cycle issue`, detail: issue });

    for (const [platform, n] of Object.entries(c.orphan_platforms ?? {})) {
      const name = platform.charAt(0).toUpperCase() + platform.slice(1);
      items.push({
        level: "warning", ...who,
        title: `${c.name}: ${plural(n, "upcoming post")} for ${name}, but no ${name} account is connected`,
        detail: "They will fail when they come due. Connect the account, or remove those posts.",
      });
    }
    if (c.social.failed > 0) items.push({ level: "critical", ...who, title: `${c.name}: ${plural(c.social.failed, "post")} failed to publish`, detail: "See Social posts for the error." });
    if (c.social.placeholders > 0) {
      items.push({ level: "warning", ...who, title: `${c.name}: ${plural(c.social.placeholders, "post")} still need captions`, detail: "The calendar is built but not yet written.", action: { job: "write_captions", label: "Write the captions", client_id: c.id } });
    }
    if (c.social.held_for_admin > 0) items.push({ level: "warning", ...who, title: `${c.name}: ${plural(c.social.held_for_admin, "draft")} held for your review`, detail: "These were not sent to the client. Open Social posts to release or edit them." });
    if (c.social.awaiting_client > 0) items.push({ level: "info", ...who, title: `${c.name}: ${plural(c.social.awaiting_client, "post")} waiting for the client to approve`, detail: "Nothing is published until they approve." });
    if (c.social.images_pending > 0) items.push({ level: "info", ...who, title: `${c.name}: ${plural(c.social.images_pending, "image")} still being generated`, detail: "Usually done within a few hours.", action: { job: "check_images", label: "Collect finished images" } });

    if (c.prospects.to_review > 0) {
      const ready = c.prospects.to_review - c.prospects.to_review_no_email;
      if (ready === 0) {
        items.push({ level: "info", ...who, title: `${c.name}: ${plural(c.prospects.to_review, "prospect")} found, none has an email yet`, detail: "Emails are looked up automatically every few hours.", action: { job: "enrich_prospects", label: "Find prospect emails" } });
      } else {
        items.push({ level: "info", ...who, title: `${c.name}: ${plural(ready, "prospect")} ready for you to approve`, detail: "Approving starts real outreach emails from the client's mailbox." });
      }
    }

    if (c.website && c.insights.seo_score === null) {
      items.push({ level: "info", ...who, title: `${c.name}: no SEO audit yet`, detail: "", action: { job: "seo_audit", label: "Run SEO audit", client_id: c.id } });
    } else if (c.insights.seo_at && now.getTime() - new Date(c.insights.seo_at).getTime() > 45 * 86_400_000) {
      items.push({ level: "warning", ...who, title: `${c.name}: SEO audit is over 45 days old`, detail: "", action: { job: "seo_audit", label: "Run SEO audit", client_id: c.id } });
    }

    if (live && c.connections.channels.length === 0) items.push({ level: "warning", ...who, title: `${c.name}: no social account connected`, detail: "Posts cannot be published until one is connected." });
    if (live && !c.connections.mailbox && c.prospects.to_review > 0) items.push({ level: "warning", ...who, title: `${c.name}: no mailbox connected`, detail: "Outreach emails cannot be sent without one." });
  }

  return items.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}

export function headline(items: AttentionItem[]): { level: "ok" | "info" | "warning" | "critical"; text: string } {
  const crit = items.filter((i) => i.level === "critical").length;
  const warn = items.filter((i) => i.level === "warning").length;
  if (crit > 0) return { level: "critical", text: `${plural(crit, "thing")} need${crit === 1 ? "s" : ""} fixing now` };
  if (warn > 0) return { level: "warning", text: `${plural(warn, "thing")} need${warn === 1 ? "s" : ""} a look` };
  if (items.length > 0) return { level: "info", text: "Running normally. A few things are waiting on people." };
  return { level: "ok", text: "Everything is running normally" };
}

/** One plain-English line describing what a manual run did, from the function's JSON reply. */
export function plainResult(job: JobDef, body: unknown): string {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const n = (k: string) => (typeof b[k] === "number" ? (b[k] as number) : null);
  if (job.key === "write_captions") return `Wrote ${n("successful") ?? 0} caption(s)${n("failed") ? `, ${n("failed")} failed` : ""}.`;
  if (job.key === "build_cycle" || job.key === "replan_cycle") {
    if (typeof b.skipped === "string") return `Skipped: ${b.skipped}.`;
    const steps = b.steps && typeof b.steps === "object" ? Object.entries(b.steps as Record<string, { status?: string; detail?: string }>) : [];
    return steps.length ? steps.map(([k, v]) => `${k.replace(/_/g, " ")}: ${v.status}${v.detail ? ` (${v.detail})` : ""}`).join("; ") : "Cycle planned.";
  }
  if (job.key === "schedule_posts") return `Created ${n("total_created") ?? 0} new post slot(s).`;
  if (job.key === "probe_visibility") return `Checked ${n("clientsProbed") ?? 0} client(s).`;
  if (job.key === "seo_audit") return typeof b.score === "number" ? `SEO score ${b.score}.` : "Audit finished.";
  const keys = Object.entries(b).filter(([, v]) => typeof v === "number" || typeof v === "boolean").slice(0, 4);
  return keys.length ? keys.map(([k, v]) => `${k}: ${v}`).join(", ") : "Done.";
}
