import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { errorResponse, handleOptions, jsonResponse } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { checkAdminAuth } from "../_shared/auth.ts";
import {
  buildAttention, CRON_INFO, cronHealth, describeSchedule, headline, JOBS, nextRun, plainResult, titleCase, type JobDef,
} from "../_shared/commandCenter.ts";

// Admin Command Center backend.
//   { action: "overview" }                         -> everything the page shows
//   { action: "runs" }                             -> just the manual-run log (cheap, polled while a job runs)
//   { action: "run", job, client_id? }             -> start an agent now; returns immediately, finishes in the background
// Admin only: a signed-in admin session or the admin password (checkAdminAuth).

type Supabase = ReturnType<typeof serviceClient>;
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUN_BUDGET_MS = 280_000;
const DUPLICATE_WINDOW_MS = 10 * 60_000;

async function overview(supabase: Supabase) {
  const [{ data, error }, orphans] = await Promise.all([
    supabase.rpc("command_center_overview"),
    supabase.rpc("command_center_orphan_posts"),
  ]);
  if (error) throw error;
  // Best effort: if this extra check fails the page still loads, just without it.
  const orphanByClient = (orphans.data ?? {}) as Record<string, Record<string, number>>;
  data.clients = (data.clients ?? []).map((c: { id: string }) => ({ ...c, orphan_platforms: orphanByClient[c.id] ?? {} }));
  const now = new Date();

  const cron = (data.cron ?? []).map((j: any) => {
    const health = cronHealth(j, now);
    const info = CRON_INFO[j.jobname];
    return {
      ...j,
      label: info?.label ?? titleCase(j.jobname),
      what: info?.what ?? "",
      schedule_text: describeSchedule(j.schedule),
      next_run: nextRun(j.schedule, now)?.toISOString() ?? null,
      state: health.state,
      note: health.note,
      run: info?.run && JOBS[info.run] ? info.run : null,
    };
  });

  const attention = buildAttention({ ...data, cron: data.cron ?? [] }, now);
  return {
    ...data,
    cron,
    attention,
    headline: headline(attention),
    catalog: Object.values(JOBS).map(({ key, label, description, group, scope, confirm }) => ({ key, label, description, group, scope, confirm: confirm ?? null })),
  };
}

async function recentRuns(supabase: Supabase) {
  const { data, error } = await supabase
    .from("admin_job_runs")
    .select("id, job, label, client_id, status, triggered_by, started_at, finished_at, result, error, client_accounts(business_name)")
    .order("started_at", { ascending: false })
    .limit(15);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ...r, client: r.client_accounts?.business_name ?? null, client_accounts: undefined }));
}

const sumNumbers = (items: unknown[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    for (const [k, v] of Object.entries(it as Record<string, unknown>)) if (typeof v === "number") out[k] = (out[k] ?? 0) + v;
  }
  return out;
};

async function execute(supabase: Supabase, job: JobDef, clientId: string | null, runId: string) {
  const started = Date.now();
  const replies: unknown[] = [];
  let failure: string | null = null;
  let stillWorking = false;
  try {
    for (let i = 0; i < (job.loop?.maxCalls ?? 1); i++) {
      if (Date.now() - started > RUN_BUDGET_MS) break;
      const { data, error } = await supabase.functions.invoke(job.fn, { body: job.body(clientId ?? undefined) });
      if (error) {
        const res = (error as { context?: Response }).context;
        const status = res?.status;
        // The gateway gives up waiting after ~150s but the function keeps going.
        if (status === 504 || status === 546 || /timeout/i.test(error.message)) { stillWorking = true; break; }
        let msg = error.message;
        try { const j = await res?.json(); msg = j?.error ?? j?.message ?? msg; } catch { /* body not JSON */ }
        failure = `${msg}${status ? ` (HTTP ${status})` : ""}`;
        break;
      }
      replies.push(data);
      if (!job.loop) break;
      if (!((data as { processed?: number })?.processed)) break; // nothing left to do
    }
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }

  const merged = job.loop ? sumNumbers(replies) : (replies[0] ?? {});
  const summary = failure
    ? `Failed: ${failure}`
    : stillWorking
    ? "Started. It is still working in the background; check back in a few minutes."
    : plainResult(job, merged);
  await supabase.from("admin_job_runs").update({
    status: failure ? "error" : "ok",
    finished_at: new Date().toISOString(),
    result: { summary, calls: replies.length, detail: JSON.stringify(merged).slice(0, 1500) },
    error: failure,
  }).eq("id", runId);
}

serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const supabase = serviceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await checkAdminAuth(req, supabase, body.password);
    if (!auth.authorized) return errorResponse("Unauthorized", 401);

    switch (body.action) {
      case "overview":
        return jsonResponse(await overview(supabase));

      case "runs":
        return jsonResponse({ manual_runs: await recentRuns(supabase) });

      case "run": {
        const job = typeof body.job === "string" ? JOBS[body.job] : undefined;
        if (!job) return errorResponse("Unknown job", 400);

        let clientId: string | null = null;
        if (job.scope === "client") {
          if (typeof body.client_id !== "string" || !UUID.test(body.client_id)) return errorResponse("This job needs a client", 400);
          const { data: c } = await supabase.from("client_accounts").select("id").eq("id", body.client_id).maybeSingle();
          if (!c) return errorResponse("Client not found", 404);
          clientId = c.id;
        }

        // Don't stack the same job twice (double-click, two admins).
        let dup = supabase.from("admin_job_runs").select("id").eq("job", job.key).eq("status", "running")
          .gt("started_at", new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString()).limit(1);
        dup = clientId ? dup.eq("client_id", clientId) : dup.is("client_id", null);
        const { data: already } = await dup;
        if (already?.length) return jsonResponse({ error: "That job is already running.", run_id: already[0].id }, 409);

        const { data: run, error: insErr } = await supabase.from("admin_job_runs").insert({
          job: job.key, label: job.label, client_id: clientId,
          triggered_by: auth.via === "session" ? "admin (signed in)" : "admin",
        }).select("id").single();
        if (insErr) throw insErr;

        const work = execute(supabase, job, clientId, run.id).catch(async (e) => {
          await supabase.from("admin_job_runs").update({ status: "error", finished_at: new Date().toISOString(), error: String(e).slice(0, 500) }).eq("id", run.id);
        });
        if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
        return jsonResponse({ run_id: run.id });
      }

      default:
        return errorResponse("Unknown action", 400);
    }
  } catch (err) {
    console.error("admin-command-center error:", err);
    return errorResponse(err);
  }
});
