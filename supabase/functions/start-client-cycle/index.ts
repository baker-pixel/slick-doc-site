import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { errorResponse, handleOptions, jsonResponse } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { checkPipelineAuth } from "../_shared/auth.ts";
import { logAlert } from "../_shared/alerts.ts";
import { tierPolicy } from "../_shared/tierPolicy.ts";
import { hasBusinessContext } from "../_shared/businessContext.ts";
import { refineClientContext } from "../_shared/contextRefine.ts";
import { upsertSocialStrategy } from "../_shared/socialStrategy.ts";
import { clientIdsWithMailbox } from "../_shared/outreachMailbox.ts";
import { ensureClientICP, nextDiscoveryFocus, previousDiscoveryFocuses } from "../_shared/icp.ts";
import { recordOutcome } from "../_shared/outcomes.ts";
import { sendFirstCycleReadyEmail } from "../_shared/cycleEmail.ts";
import { collectRecentTopics } from "../_shared/topicLedger.ts";
import {
  closeCycle,
  isRetryableSkip,
  isRunInProgress,
  remainingSteps,
  type StepRecord,
  type CycleRow,
  type CycleTrigger,
  computeDigest,
  openCycle,
  planIssues,
  sweepWindow,
} from "../_shared/cycle.ts";

// Cycle rollover. A cycle is one paid billing period. When an invoice is paid
// (stripe-webhook) or the daily sweep notices a paid period with no cycle:
//   1. close the previous cycle into a digest (approvals, rejections, replies),
//   2. re-learn the client's context from that outcome data,
//   3. regenerate the social pillars knowing what was posted/rejected,
//   4. schedule the social calendar from now to the END of the paid period,
//   5. run a fresh, rotated prospect search (never the same query twice).
// Every step is isolated: one failing never blocks the others, and the whole
// run is idempotent on (client, period_end) so webhook retries, the sweep and
// manual runs converge. Kill switch: admin_settings.cycle_rollover = 'off'.
//
// Body: { client_id, period_start?, period_end?, stripe_invoice_id?, trigger?, force? }
//   with client_id    -> roll one client (period defaults to its current Stripe period)
//   without client_id -> sweep: roll every paid client whose period has no cycle

const SWEEP_MAX_PER_RUN = 3; // each rollover makes several LLM + discovery calls
const MAX_ATTEMPTS = 3; // stop retrying a cycle that keeps failing (cost guard)
const HOUR_MS = 3_600_000;

type Supabase = ReturnType<typeof serviceClient>;
type StepResult = { status: "ok" | "skipped" | "error"; detail?: string };

async function rolloverEnabled(supabase: Supabase): Promise<boolean> {
  const { data } = await supabase.from("admin_settings").select("value").eq("key", "cycle_rollover").maybeSingle();
  return (data?.value ?? "on") !== "off";
}

async function callFn(name: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({ ...body, password: Deno.env.get("ADMIN_PASSWORD") }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(data?.error ?? `${name} returned ${res.status}`);
  return data;
}

async function step(steps: Record<string, StepResult>, name: string, fn: () => Promise<StepResult>) {
  try {
    steps[name] = await fn();
  } catch (e) {
    console.error(`start-client-cycle: step ${name} failed:`, e);
    steps[name] = { status: "error", detail: e instanceof Error ? e.message : String(e) };
  }
}

interface RolloverOpts {
  source: CycleTrigger;
  invoiceId?: string | null;
  force?: boolean;
}

async function rolloverClient(
  supabase: Supabase,
  clientId: string,
  window: { start: Date; end: Date } | null,
  opts: RolloverOpts,
): Promise<Record<string, unknown>> {
  const { data: client, error } = await supabase
    .from("client_accounts")
    .select("id, business_name, industry, tier, status, context_profile, icp, current_period_end, onboarded_at, created_at")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw error;
  if (!client) return { client_id: clientId, skipped: "client not found" };
  // Paused/cancelled clients get no planning; the sweep picks them up once billing resumes.
  if (client.status !== "active") return { client_id: clientId, skipped: `client is ${client.status}` };
  if (opts.source !== "manual" && !(await rolloverEnabled(supabase))) {
    return { client_id: clientId, skipped: "cycle_rollover is off" };
  }

  let win = window;
  if (!win) {
    if (!client.current_period_end) return { client_id: clientId, skipped: "no billing period on file" };
    const { data: last } = await supabase.from("client_cycles").select("period_end")
      .eq("client_account_id", clientId).order("period_end", { ascending: false }).limit(1).maybeSingle();
    win = sweepWindow(client.current_period_end, last?.period_end ?? null);
  }

  const { cycle, created } = await openCycle(supabase, clientId, win, opts.source, opts.invoiceId ?? null);
  const attempts = Number(cycle.plan?.attempts ?? 0);
  if (!created && !opts.force) {
    if (cycle.status === "active" || cycle.status === "closed") {
      return { client_id: clientId, cycle_id: cycle.id, skipped: `cycle already ${cycle.status}` };
    }
    if (attempts >= MAX_ATTEMPTS) {
      return { client_id: clientId, cycle_id: cycle.id, skipped: `gave up after ${attempts} attempts` };
    }
    if (isRunInProgress(cycle.plan)) {
      return { client_id: clientId, cycle_id: cycle.id, skipped: "another run is in progress" };
    }
  }

  // Consume the attempt BEFORE doing any work. If this run times out partway,
  // the sweep still sees the attempt and eventually stops retrying, instead of
  // re-running paid LLM/discovery calls every hour forever.
  const startedPlan: Record<string, any> = { ...cycle.plan, attempts: attempts + 1, last_attempt_at: new Date().toISOString() };
  await supabase.from("client_cycles").update({ plan: startedPlan, updated_at: new Date().toISOString() }).eq("id", cycle.id);

  // 1. Close earlier cycles and take the freshest digest as this cycle's input.
  const { data: open } = await supabase.from("client_cycles").select("*")
    .eq("client_account_id", clientId).in("status", ["active", "planning", "failed"])
    .lt("period_end", cycle.period_end).order("period_end", { ascending: true });
  let previousDigest: Record<string, any> | null = null;
  for (const prev of (open ?? []) as CycleRow[]) {
    try {
      previousDigest = await closeCycle(supabase, prev);
      await recordCycleOutcomes(supabase, clientId, prev, previousDigest);
    } catch (e) {
      console.error(`start-client-cycle: closing cycle ${prev.id} failed:`, e);
    }
  }
  if (!previousDigest) {
    const { data: closed } = await supabase.from("client_cycles").select("digest")
      .eq("client_account_id", clientId).eq("status", "closed").lt("period_end", cycle.period_end)
      .order("period_end", { ascending: false }).limit(1).maybeSingle();
    previousDigest = closed?.digest ?? null;
  }
  if (!previousDigest) {
    // First cycle for this client: learn from the month before it, unsaved.
    const lookback = new Date(new Date(cycle.period_start).getTime() - 30 * 24 * HOUR_MS);
    previousDigest = await computeDigest(supabase, {
      ...cycle, period_start: lookback.toISOString(), period_end: cycle.period_start,
    }).catch(() => null);
  }
  const learned: string[] = previousDigest?.learned ?? [];

  // 2-5. Plan. Each step isolated.
  // Resume a cycle that died mid-run (timeout): steps already done are kept
  // and not repeated (a second paid discovery run would be wasted spend).
  // `force` re-runs everything.
  const priorSteps: Record<string, StepResult> = opts.force ? {} : (cycle.plan?.steps ?? {});
  const only = remainingSteps(priorSteps as Record<string, StepRecord>, PLAN_STEP_NAMES);

  const { steps: fresh, discovery } = only && only.size === 0
    ? { steps: {} as Record<string, StepResult>, discovery: {} as Record<string, unknown> }
    : await planSteps(supabase, client, cycle, learned, only, async (soFar, disc) => {
      await supabase.from("client_cycles").update({
        plan: { ...startedPlan, steps: { ...priorSteps, ...soFar }, discovery: { ...(cycle.plan?.discovery ?? {}), ...disc }, learned },
        updated_at: new Date().toISOString(),
      }).eq("id", cycle.id);
    });
  const steps = { ...priorSteps, ...fresh };

  const results = Object.values(steps);
  const worked = results.filter((s) => s.status !== "skipped");
  const failed = results.filter((s) => s.status === "error");
  const allFailed = worked.length > 0 && failed.length === worked.length;
  const status = allFailed ? "failed" : "active";

  await supabase.from("client_cycles").update({
    status,
    plan: { ...startedPlan, steps, discovery: { ...(cycle.plan?.discovery ?? {}), ...discovery }, learned, issues: planIssues(steps, { ...(cycle.plan?.discovery ?? {}), ...discovery }) },
    error: failed.length ? failed.map((s) => s.detail).join("; ").slice(0, 500) : null,
    planned_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", cycle.id);

  if (failed.length) {
    await logAlert(supabase, {
      source: "start-client-cycle",
      alertType: "cycle_rollover_step_failed",
      severity: allFailed ? "error" : "warning",
      title: `Cycle ${cycle.cycle_no} planning ${allFailed ? "failed" : "partly failed"}: ${client.business_name}`,
      message: Object.entries(steps).filter(([, s]) => s.status === "error").map(([n, s]) => `${n}: ${s.detail}`).join("\n").slice(0, 900),
      sourceId: clientId,
      metadata: { cycle_id: cycle.id, steps },
    });
  }

  return { client_id: clientId, cycle_id: cycle.id, cycle_no: cycle.cycle_no, status, steps };
}

const PLAN_STEP_NAMES = ["learn", "social_strategy", "social_schedule", "prospect_discovery"];
const RETRYABLE = "retry_when_ready";

/** A skip caused by onboarding not being finished yet; the sweep re-runs it once it is. */
const notReady = (detail: string): StepResult => ({ status: "skipped", detail, [RETRYABLE]: true } as StepResult);


interface PlanClient {
  id: string;
  business_name: string;
  industry: string | null;
  tier: string | null;
  context_profile: any;
  icp: unknown;
  onboarded_at: string | null;
  created_at: string | null;
}

/**
 * The planning steps for one cycle. `only` restricts a re-plan to the steps
 * that were skipped earlier (e.g. the client has since finished onboarding);
 * steps outside it are left exactly as they were.
 */
async function planSteps(
  supabase: Supabase,
  client: PlanClient,
  cycle: CycleRow,
  learned: string[],
  only?: Set<string>,
  /** Called after every step so progress survives a timeout mid-run. */
  onStep?: (steps: Record<string, StepResult>, discovery: Record<string, unknown>) => Promise<void>,
): Promise<{ steps: Record<string, StepResult>; discovery: Record<string, unknown> }> {
  const clientId = client.id;
  const policy = tierPolicy(client.tier);
  const steps: Record<string, StepResult> = {};
  const discovery: Record<string, unknown> = {};
  const run = async (name: string, fn: () => Promise<StepResult>) => {
    if (only && !only.has(name)) return;
    await step(steps, name, fn);
    await onStep?.(steps, discovery).catch((e) => console.error("start-client-cycle: progress save failed:", e));
  };

  await run("learn", async () => {
    const r = await refineClientContext(supabase, clientId);
    return { status: r.refined ? "ok" : "skipped", detail: r.refined ? undefined : "nothing new to learn from" };
  });

  await run("social_strategy", async () => {
    if (!hasBusinessContext(client)) return notReady("business context incomplete");
    const { data: rows } = await supabase.from("content_calendar").select("title, metadata")
      .eq("client_account_id", clientId).not("content", "like", "[Auto-generated placeholder%")
      .order("scheduled_for", { ascending: false }).limit(80);
    const res = await upsertSocialStrategy(supabase, client, policy, {
      learned,
      recentTopics: collectRecentTopics(rows ?? [], 30),
    });
    return res.projectId
      ? { status: "ok", detail: `${res.pillars.length} pillars` }
      : { status: "error", detail: "strategy generation failed" };
  });

  await run("social_schedule", async () => {
    if (!hasBusinessContext(client)) return notReady("business context incomplete");
    // auto-schedule-content finds this cycle itself and schedules to its end.
    const r = await callFn("auto-schedule-content", { client_id: clientId });
    // No slots AND a message means the scheduler filtered this client out
    // (portal invite not accepted yet): not done, retry later.
    if (r.total_created === undefined && r.message) return notReady(String(r.message));
    return { status: "ok", detail: `${r.total_created ?? 0} slots` };
  });

  await run("prospect_discovery", async () => {
    if (!policy.prospect.enabled) return { status: "skipped", detail: "tier has no prospect agent" };
    const mailbox = await clientIdsWithMailbox(supabase, [clientId]);
    if (!mailbox.has(clientId)) return notReady("no mailbox connected");
    const icp = await ensureClientICP(supabase, client);
    if (!icp) return notReady("no ICP yet");

    const web = icp.local === false;
    const fn = web ? "discover-prospects-web" : "discover-prospects";
    const body: Record<string, unknown> = { client_id: clientId, max_results: policy.prospect.discoveryBatch };
    if (web) {
      // Rotate the search so this cycle's leads are new, not last cycle's again.
      const focus = await nextDiscoveryFocus(clientId, icp, await previousDiscoveryFocuses(supabase, clientId), learned);
      if (focus) body.focus = focus;
      discovery.focus = focus;
    } // Maps discovery excludes already-searched queries on its own.
    discovery.fn = fn;
    const r = await callFn(fn, body);
    discovery.discovered = r.discovered ?? 0;
    return { status: "ok", detail: `${r.discovered ?? 0} new via ${fn}` };
  });

  return { steps, discovery };
}

/** Numeric outcomes per closed cycle so reporting can chart trends. */
async function recordCycleOutcomes(supabase: Supabase, clientId: string, cycle: CycleRow, digest: Record<string, any>) {
  const base = { periodStart: cycle.period_start, periodEnd: cycle.period_end, metadata: { cycle_id: cycle.id, cycle_no: cycle.cycle_no } };
  if (digest.social?.approval_rate != null) {
    await recordOutcome(supabase, clientId, { source: "social", metric: "cycle_approval_rate", value: digest.social.approval_rate, ...base });
  }
  await recordOutcome(supabase, clientId, { source: "social", metric: "cycle_posts_published", value: digest.social?.published ?? 0, ...base });
  await recordOutcome(supabase, clientId, { source: "prospect", metric: "cycle_prospects_replied", value: digest.prospect?.replied ?? 0, ...base });
}

/**
 * Re-runs only the steps a cycle skipped because onboarding was unfinished
 * (business info, mailbox, ICP), once the client has since completed them. The
 * first time scheduling goes from skipped to done on a client's first cycle,
 * they get a "your first cycle is planned" email.
 */
async function replanCycle(supabase: Supabase, cycle: CycleRow): Promise<Record<string, unknown> | null> {
  const prior: Record<string, StepResult> = cycle.plan?.steps ?? {};
  const only = new Set(Object.entries(prior).filter(([, r]) => isRetryableSkip(r)).map(([n]) => n));
  if (only.size === 0) return null;

  const { data: client } = await supabase
    .from("client_accounts")
    .select("id, business_name, first_name, email, industry, tier, status, context_profile, icp, onboarded_at, created_at")
    .eq("id", cycle.client_account_id).maybeSingle();
  if (!client || client.status !== "active") return null;

  const { steps: fresh, discovery } = await planSteps(supabase, client, cycle, cycle.plan?.learned ?? [], only);
  // Nothing newly unblocked: leave the cycle untouched (no churn on every sweep).
  if (!Object.values(fresh).some((r) => !isRetryableSkip(r))) return null;

  const merged = { ...prior, ...fresh };
  const scheduledNow = prior.social_schedule?.status === "skipped" && fresh.social_schedule?.status === "ok";
  const mergedDiscovery = { ...(cycle.plan?.discovery ?? {}), ...discovery };
  const plan: Record<string, any> = { ...cycle.plan, steps: merged, discovery: mergedDiscovery, issues: planIssues(merged, mergedDiscovery) };

  if (scheduledNow && cycle.cycle_no === 1 && !plan.ready_email_sent && client.email) {
    const slots = Number(String(fresh.social_schedule?.detail ?? "").match(/^(\d+)/)?.[1] ?? 0);
    await sendFirstCycleReadyEmail(client.email, client.first_name, cycle.period_end, slots);
    plan.ready_email_sent = true;
  }

  const failed = Object.values(fresh).filter((r) => r.status === "error");
  await supabase.from("client_cycles").update({
    plan,
    error: failed.length ? failed.map((r) => r.detail).join("; ").slice(0, 500) : null,
    updated_at: new Date().toISOString(),
  }).eq("id", cycle.id);

  return { client_id: cycle.client_account_id, cycle_id: cycle.id, replanned: Object.keys(fresh), steps: fresh };
}

async function sweep(supabase: Supabase): Promise<Record<string, unknown>> {
  if (!(await rolloverEnabled(supabase))) return { skipped: "cycle_rollover is off" };

  const { data: clients } = await supabase
    .from("client_accounts")
    .select("id, current_period_end")
    .eq("status", "active")
    .in("subscription_status", ["active", "trialing"]) // not past_due: a rolled period without payment is not a paid cycle
    .gt("current_period_end", new Date().toISOString());

  const due: string[] = [];
  for (const c of clients ?? []) {
    const { data: cycles } = await supabase.from("client_cycles").select("period_end, status, plan")
      .eq("client_account_id", c.id).order("period_end", { ascending: false }).limit(1);
    const latest = cycles?.[0];
    const cpe = new Date(c.current_period_end).getTime();
    if (latest) {
      const sameEnd = Math.abs(new Date(latest.period_end).getTime() - cpe) < HOUR_MS;
      if (new Date(latest.period_end).getTime() > cpe + HOUR_MS) continue; // already ahead
      if (sameEnd && (latest.status === "active" || latest.status === "closed")) continue;
      if (sameEnd && Number(latest.plan?.attempts ?? 0) >= MAX_ATTEMPTS) continue;
      if (sameEnd && isRunInProgress(latest.plan)) continue;
    }
    due.push(c.id);
  }

  const results: Record<string, unknown>[] = [];
  for (const id of due.slice(0, SWEEP_MAX_PER_RUN)) {
    try {
      results.push(await rolloverClient(supabase, id, null, { source: "sweep" }));
    } catch (e) {
      console.error(`start-client-cycle sweep: ${id} failed:`, e);
      results.push({ client_id: id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Cycles planned before the client finished onboarding: finish the skipped
  // steps now that they may have. Shares the per-run work budget.
  const replans: Record<string, unknown>[] = [];
  if (results.length < SWEEP_MAX_PER_RUN) {
    const nowIso = new Date().toISOString();
    const { data: live } = await supabase.from("client_cycles").select("*")
      .eq("status", "active").lte("period_start", nowIso).gt("period_end", nowIso);
    for (const cyc of (live ?? []) as CycleRow[]) {
      if (results.length + replans.length >= SWEEP_MAX_PER_RUN) break;
      if (!Object.values(cyc.plan?.steps ?? {}).some((r) => isRetryableSkip(r as StepResult))) continue;
      try {
        const r = await replanCycle(supabase, cyc);
        if (r) replans.push(r);
      } catch (e) {
        console.error(`start-client-cycle replan ${cyc.id} failed:`, e);
      }
    }
  }
  return { due: due.length, processed: results.length, results, replans };
}

serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const supabase = serviceClient();
    const body = await req.json().catch(() => ({}));
    if (!(await checkPipelineAuth(req, supabase, body.password))) return errorResponse("Unauthorized", 401);

    if (!body.client_id) return jsonResponse(await sweep(supabase));

    let window: { start: Date; end: Date } | null = null;
    if (body.period_start || body.period_end) {
      const start = new Date(body.period_start), end = new Date(body.period_end);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
        return errorResponse("period_start/period_end must be valid ISO dates with end after start", 400);
      }
      window = { start, end };
    }
    const source: CycleTrigger = ["invoice_paid", "sweep", "manual"].includes(body.trigger) ? body.trigger : "manual";
    return jsonResponse(
      await rolloverClient(supabase, body.client_id, window, {
        source,
        invoiceId: typeof body.stripe_invoice_id === "string" ? body.stripe_invoice_id : null,
        force: body.force === true,
      }),
    );
  } catch (err) {
    console.error("start-client-cycle error:", err);
    return errorResponse(err);
  }
});
