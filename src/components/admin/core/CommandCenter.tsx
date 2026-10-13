import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import {
  Activity, AlertTriangle, CheckCircle2, ChevronDown, Clock, Image as ImageIcon, Info, Loader2, Mail, Play,
  RefreshCw, Rocket, Search, Share2, Users, XCircle, Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { friendlyEdgeMessage, getEdgeErrorMessage } from "@/lib/edge-error";
import { cn } from "@/lib/utils";

// ---------- types (mirror admin-command-center) ----------

type Level = "critical" | "warning" | "info";
interface AttentionItem {
  level: Level; title: string; detail: string; client_id?: string; client?: string;
  action?: { job: string; label: string; client_id?: string };
}
interface CatalogJob { key: string; label: string; description: string; group: string; scope: "client" | "global"; confirm: string | null }
interface CronJob {
  jobname: string; label: string; what: string; schedule_text: string; active: boolean;
  last_start: string | null; last_status: string | null; next_run: string | null;
  state: "ok" | "late" | "failed" | "idle" | "paused"; note: string; run: string | null;
}
interface ManualRun {
  id: string; job: string; label: string; client: string | null; client_id: string | null; status: "running" | "ok" | "error";
  triggered_by: string; started_at: string; finished_at: string | null; result: { summary?: string } | null; error: string | null;
}
interface ClientBlock {
  id: string; name: string; tier: string; status: string; subscription: string | null; period_end: string | null; website: string | null;
  cycle: { no: number; status: string; start: string; end: string; steps: Record<string, { status: string }> | null } | null;
  social: {
    upcoming: number; placeholders: number; drafts: number; scheduled: number; published: number; failed: number; with_image: number;
    images_pending: number; awaiting_client: number; held_for_admin: number; next_post: string | null;
  };
  prospects: { total: number; to_review: number; to_review_no_email: number; in_outreach: number; replied: number };
  insights: { seo_score: number | null; seo_at: string | null; visibility_score: number | null; visibility_at: string | null };
  connections: { channels: string[]; mailbox: boolean };
  ai_7d: { calls: number; failed: number };
}
interface Overview {
  generated_at: string;
  headline: { level: "ok" | "info" | "warning" | "critical"; text: string };
  attention: AttentionItem[];
  catalog: CatalogJob[];
  cron: CronJob[];
  clients: ClientBlock[];
  manual_runs: ManualRun[];
  ai_24h: { calls: number; failed: number; tokens: number; by_agent: Array<{ agent: string; calls: number; failed: number; last_at: string }> };
  queues: { emails_waiting: number; emails_failed_24h: number; image_batches_open: number };
  failed_http_24h: { count: number };
  activity: Array<{ at: string; client: string | null; title: string; description: string }>;
}

interface Props {
  adminPassword: string;
  onSelectClient: (clientId: string, businessName: string) => void;
  onNavigateToSection: (section: string) => void;
}

// ---------- helpers ----------

async function api<T>(password: string, body: Record<string, unknown>): Promise<T> {
  if (!password) throw new Error("Admin session expired — please log in again");
  const { data, error } = await supabase.functions.invoke("admin-command-center", { body: { ...body, password } });
  const msg = await getEdgeErrorMessage(error, data);
  if (msg) throw new Error(friendlyEdgeMessage(msg));
  return data as T;
}

const ago = (iso: string | null) => (iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "never");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const BANNER: Record<Overview["headline"]["level"], { box: string; icon: typeof CheckCircle2 }> = {
  ok: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: CheckCircle2 },
  info: { box: "border-sky-200 bg-sky-50 text-sky-900", icon: Info },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: AlertTriangle },
  critical: { box: "border-red-200 bg-red-50 text-red-900", icon: XCircle },
};
const LEVEL_ICON: Record<Level, { icon: typeof Info; cls: string }> = {
  critical: { icon: XCircle, cls: "text-red-600" },
  warning: { icon: AlertTriangle, cls: "text-amber-600" },
  info: { icon: Info, cls: "text-sky-600" },
};
const STATE_STYLE: Record<CronJob["state"], { dot: string; label: string }> = {
  ok: { dot: "bg-emerald-500", label: "On time" },
  late: { dot: "bg-amber-500", label: "Late" },
  failed: { dot: "bg-red-500", label: "Failed" },
  idle: { dot: "bg-slate-300", label: "Not due yet" },
  paused: { dot: "bg-slate-300", label: "Off" },
};
const STATE_RANK: Record<CronJob["state"], number> = { failed: 0, late: 1, ok: 2, idle: 3, paused: 4 };

interface PendingRun { job: string; clientId?: string; label: string; confirm: string }

// ---------- component ----------

export function CommandCenter({ adminPassword, onSelectClient, onNavigateToSection }: Props) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingRun | null>(null);
  const [startedKeys, setStartedKeys] = useState<Set<string>>(new Set());

  const overview = useQuery({
    queryKey: ["command-center", adminPassword],
    queryFn: () => api<Overview>(adminPassword, { action: "overview" }),
    refetchInterval: 30_000,
    staleTime: 10_000,
    enabled: !!adminPassword,
  });
  const data = overview.data;

  // While anything is running, poll just the small run log and refresh everything when it finishes.
  const runningNow = (data?.manual_runs ?? []).some((r) => r.status === "running") || startedKeys.size > 0;
  const runs = useQuery({
    queryKey: ["command-center-runs", adminPassword],
    queryFn: () => api<{ manual_runs: ManualRun[] }>(adminPassword, { action: "runs" }),
    refetchInterval: runningNow ? 4_000 : false,
    enabled: !!adminPassword && runningNow,
  });
  const runList = useMemo(() => runs.data?.manual_runs ?? data?.manual_runs ?? [], [runs.data, data?.manual_runs]);
  const runningKeys = useMemo(
    () => new Set(runList.filter((r) => r.status === "running").map((r) => `${r.job}:${r.client_id ?? ""}`)),
    [runList],
  );

  const hadRunning = useRef(false);
  useEffect(() => {
    const anyRunning = runningKeys.size > 0;
    if (hadRunning.current && !anyRunning) {
      setStartedKeys(new Set());
      queryClient.invalidateQueries({ queryKey: ["command-center"] });
    }
    hadRunning.current = anyRunning;
  }, [runningKeys, queryClient]);

  const isRunning = (job: string, clientId?: string) => runningKeys.has(`${job}:${clientId ?? ""}`) || startedKeys.has(`${job}:${clientId ?? ""}`);

  const start = async (job: string, label: string, clientId?: string) => {
    const key = `${job}:${clientId ?? ""}`;
    setStartedKeys((s) => new Set(s).add(key));
    try {
      await api(adminPassword, { action: "run", job, client_id: clientId });
      toast({ title: `Started: ${label}`, description: "It runs in the background. Progress shows under Recent runs." });
      queryClient.invalidateQueries({ queryKey: ["command-center-runs"] });
    } catch (e) {
      setStartedKeys((s) => { const n = new Set(s); n.delete(key); return n; });
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: /already running/i.test(msg) ? "That job is already running" : `Could not start ${label}`, description: msg, variant: /already running/i.test(msg) ? "default" : "destructive" });
    }
  };

  const request = (job: string, clientId?: string) => {
    const def = data?.catalog.find((j) => j.key === job);
    if (!def) return;
    if (def.confirm) setPending({ job, clientId, label: def.label, confirm: def.confirm });
    else void start(job, def.label, clientId);
  };

  if (overview.isLoading) {
    return <div className="flex items-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading the command center…</div>;
  }
  if (overview.error || !data) {
    return (
      <Card className="border-red-200"><CardContent className="space-y-3 p-6">
        <p className="font-medium text-red-700">The command center could not load.</p>
        <p className="text-sm text-muted-foreground">{(overview.error as Error | null)?.message ?? "No data came back."}</p>
        <Button variant="outline" size="sm" onClick={() => overview.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button>
      </CardContent></Card>
    );
  }

  const banner = BANNER[data.headline.level];
  const BannerIcon = banner.icon;
  const healthyJobs = data.cron.filter((j) => j.state === "ok" || j.state === "idle" || j.state === "paused").length;
  const clientJobs = data.catalog.filter((j) => j.scope === "client" && j.key !== "replan_cycle");
  const globalJobs = data.catalog.filter((j) => j.scope === "global");
  const cron = [...data.cron].sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || (a.next_run ?? "").localeCompare(b.next_run ?? ""));

  const RunButton = ({ job, clientId, compact, label }: { job: string; clientId?: string; compact?: boolean; label?: string }) => {
    const def = data.catalog.find((j) => j.key === job);
    const running = isRunning(job, clientId);
    return (
      <Button
        size="sm" variant="outline" disabled={running} className={cn(compact && "h-7 px-2 text-xs")}
        title={def?.description} onClick={() => request(job, clientId)}
      >
        {running ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}
        {label ?? def?.label ?? job}
      </Button>
    );
  };

  return (
    <div className="space-y-8">
      {/* Header + headline */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Command Center</h1>
            <p className="text-sm text-muted-foreground">Everything the platform is doing, what went wrong, and what needs you.</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Updated {ago(data.generated_at)}</span>
            <Button size="sm" variant="outline" onClick={() => overview.refetch()} disabled={overview.isFetching}>
              <RefreshCw className={cn("mr-2 h-4 w-4", overview.isFetching && "animate-spin")} />Refresh
            </Button>
          </div>
        </div>

        <div className={cn("flex items-center gap-3 rounded-lg border p-4", banner.box)}>
          <BannerIcon className="h-6 w-6 shrink-0" />
          <p className="text-lg font-semibold">{data.headline.text}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat icon={Clock} label="Scheduled jobs on track" value={`${healthyJobs} of ${data.cron.length}`} warn={healthyJobs < data.cron.length} />
          <Stat icon={Zap} label="AI calls, last 24h" value={data.ai_24h.calls.toLocaleString()} sub={data.ai_24h.failed ? `${data.ai_24h.failed} failed` : "none failed"} warn={data.ai_24h.failed > 0} />
          <Stat icon={Mail} label="Emails waiting to send" value={data.queues.emails_waiting.toLocaleString()} sub={data.queues.emails_failed_24h ? `${data.queues.emails_failed_24h} failed today` : undefined} warn={data.queues.emails_failed_24h > 0} />
          <Stat icon={ImageIcon} label="Image batches in progress" value={String(data.queues.image_batches_open)} />
          <Stat icon={Users} label="Active clients" value={String(data.clients.filter((c) => c.status === "active").length)} />
        </div>
      </div>

      {/* Needs attention */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Needs your attention</h2>
        {data.attention.length === 0 ? (
          <Card><CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Nothing needs you right now.</CardContent></Card>
        ) : (
          <Card><CardContent className="divide-y p-0">
            {data.attention.map((a, i) => {
              const L = LEVEL_ICON[a.level];
              return (
                <div key={`${a.title}-${i}`} className="flex flex-wrap items-center gap-3 p-3">
                  <L.icon className={cn("h-5 w-5 shrink-0", L.cls)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{a.title}</p>
                    {a.detail && <p className="text-xs text-muted-foreground">{a.detail}</p>}
                  </div>
                  {a.action && <RunButton job={a.action.job} clientId={a.action.client_id} compact label={a.action.label} />}
                  {a.client_id && a.client && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onSelectClient(a.client_id!, a.client!)}>Open client</Button>
                  )}
                </div>
              );
            })}
          </CardContent></Card>
        )}
      </section>

      {/* Clients */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Clients</h2>
        <p className="-mt-2 text-sm text-muted-foreground">Where each client's work stands, with a button for each agent. Buttons run in the background.</p>
        <div className="grid gap-4 xl:grid-cols-2">
          {data.clients.map((c) => <ClientCard key={c.id} c={c} jobs={clientJobs} RunButton={RunButton} onOpen={() => onSelectClient(c.id, c.name)} onNavigate={onNavigateToSection} request={request} isRunning={isRunning} />)}
        </div>
      </section>

      {/* Run now */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Rocket className="h-5 w-5" />Run an agent now</h2>
        <p className="-mt-2 text-sm text-muted-foreground">These normally run on a timer for every client. Run one now to see its effect immediately.</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {globalJobs.map((j) => (
            <Card key={j.key}><CardContent className="flex h-full flex-col justify-between gap-3 p-4">
              <div><p className="font-medium">{j.label}</p><p className="mt-1 text-xs text-muted-foreground">{j.description}</p></div>
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[10px] capitalize">{j.group}</Badge>
                <RunButton job={j.key} compact label="Run now" />
              </div>
            </CardContent></Card>
          ))}
        </div>
      </section>

      {/* Scheduled jobs */}
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="group flex w-full items-center justify-between text-left">
          <h2 className="text-lg font-semibold">Scheduled jobs <span className="text-sm font-normal text-muted-foreground">({data.cron.length}, problems first)</span></h2>
          <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <Card><CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground">
                <th className="p-3 font-medium">Job</th><th className="p-3 font-medium">Runs</th><th className="p-3 font-medium">Last ran</th><th className="p-3 font-medium">Next</th><th className="p-3" />
              </tr></thead>
              <tbody>
                {cron.map((j) => (
                  <tr key={j.jobname} className="border-b last:border-0">
                    <td className="p-3">
                      <div className="flex items-start gap-2">
                        <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", STATE_STYLE[j.state].dot)} title={STATE_STYLE[j.state].label} />
                        <div>
                          <p className="font-medium">{j.label}</p>
                          <p className="text-xs text-muted-foreground">{j.state === "ok" || j.state === "idle" ? j.what : <span className={j.state === "failed" ? "text-red-600" : "text-amber-700"}>{j.note || STATE_STYLE[j.state].label}</span>}</p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap p-3 text-muted-foreground">{j.schedule_text}</td>
                    <td className="whitespace-nowrap p-3 text-muted-foreground">{ago(j.last_start)}</td>
                    <td className="whitespace-nowrap p-3 text-muted-foreground">{j.active && j.next_run ? ago(j.next_run) : "—"}</td>
                    <td className="p-3 text-right">{j.run && <RunButton job={j.run} compact label="Run now" clientId={undefined} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent></Card>
          <p className="mt-2 text-xs text-muted-foreground">"Last ran" is when the timer fired. A job that fires but is refused by its function is counted under "scheduled calls refused" above.</p>
        </CollapsibleContent>
      </Collapsible>

      {/* Recent runs + AI + activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Recent runs from this page</h2>
          <Card><CardContent className="divide-y p-0">
            {runList.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nothing has been run from here yet.</p>}
            {runList.map((r) => (
              <div key={r.id} className="space-y-1 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {r.status === "running" ? <Loader2 className="h-4 w-4 animate-spin text-sky-600" /> : r.status === "ok" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                  <span className="font-medium">{r.label}</span>
                  {r.client && <Badge variant="secondary" className="text-[10px]">{r.client}</Badge>}
                  <span className="ml-auto text-xs text-muted-foreground">{ago(r.started_at)}</span>
                </div>
                <p className={cn("text-xs", r.status === "error" ? "text-red-600" : "text-muted-foreground")}>
                  {r.status === "running" ? "Working…" : r.error ? `Failed: ${r.error}` : r.result?.summary ?? "Done."}
                </p>
              </div>
            ))}
          </CardContent></Card>
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Activity className="h-5 w-5" />What the AI did in the last 24 hours</h2>
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-3 font-medium">Agent</th><th className="p-3 font-medium">Calls</th><th className="p-3 font-medium">Failed</th><th className="p-3 font-medium">Last</th></tr></thead>
              <tbody>
                {data.ai_24h.by_agent.length === 0 && <tr><td colSpan={4} className="p-4 text-muted-foreground">No AI activity in the last 24 hours.</td></tr>}
                {data.ai_24h.by_agent.map((a) => (
                  <tr key={a.agent} className="border-b last:border-0">
                    <td className="p-3">{a.agent.replace(/[-_]/g, " ")}</td><td className="p-3">{a.calls}</td>
                    <td className={cn("p-3", a.failed > 0 && "font-medium text-red-600")}>{a.failed}</td><td className="p-3 text-muted-foreground">{ago(a.last_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t p-3 text-xs text-muted-foreground">{data.ai_24h.tokens.toLocaleString()} tokens used in total.</p>
          </CardContent></Card>
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Latest activity</h2>
        <Card><CardContent className="divide-y p-0">
          {data.activity.length === 0 && <p className="p-4 text-sm text-muted-foreground">No activity recorded yet.</p>}
          {data.activity.map((a, i) => (
            <div key={i} className="flex items-start gap-3 p-3 text-sm">
              <span className="w-28 shrink-0 text-xs text-muted-foreground">{format(new Date(a.at), "MMM d, HH:mm")}</span>
              <div className="min-w-0">
                <p>{a.client && <span className="font-medium">{a.client}: </span>}{a.title}</p>
                {a.description && <p className="truncate text-xs text-muted-foreground">{a.description}</p>}
              </div>
            </div>
          ))}
        </CardContent></Card>
      </section>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.label}</AlertDialogTitle>
            <AlertDialogDescription>{pending?.confirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pending) void start(pending.job, pending.label, pending.clientId); setPending(null); }}>Yes, run it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------- pieces ----------

function Stat({ icon: Icon, label, value, sub, warn }: { icon: typeof Info; label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <Card><CardContent className="space-y-1 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
      <p className="text-2xl font-semibold">{value}</p>
      {sub && <p className={cn("text-xs", warn ? "text-red-600" : "text-muted-foreground")}>{sub}</p>}
    </CardContent></Card>
  );
}

function Row({ icon: Icon, title, children }: { icon: typeof Info; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p><div>{children}</div></div>
    </div>
  );
}

function ClientCard({ c, jobs, RunButton, onOpen, onNavigate, request, isRunning }: {
  c: ClientBlock; jobs: CatalogJob[];
  RunButton: (p: { job: string; clientId?: string; compact?: boolean; label?: string }) => JSX.Element;
  onOpen: () => void; onNavigate: (s: string) => void; request: (job: string, clientId?: string) => void; isRunning: (job: string, clientId?: string) => boolean;
}) {
  const s = c.social, p = c.prospects;
  const failedSteps = Object.entries(c.cycle?.steps ?? {}).filter(([, v]) => v.status === "error").length;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <button className="text-left hover:underline" onClick={onOpen}>{c.name}</button>
          <Badge variant="outline" className="capitalize">{c.tier}</Badge>
          <Badge variant={c.subscription === "active" ? "default" : "secondary"} className="capitalize">{c.subscription === "none" || !c.subscription ? "no subscription" : c.subscription}</Badge>
        </CardTitle>
        {c.period_end && <CardDescription>Billing period ends {format(new Date(c.period_end), "MMM d")}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        <Row icon={RefreshCw} title="This cycle">
          {c.cycle
            ? <>Cycle {c.cycle.no}: {format(new Date(c.cycle.start), "MMM d")} to {format(new Date(c.cycle.end), "MMM d")}. {failedSteps ? <span className="text-red-600">{plural(failedSteps, "step")} failed.</span> : "All planning steps ran."}</>
            : <span className="text-amber-700">No plan built yet.</span>}
        </Row>
        <Row icon={Share2} title="Social posts">
          {s.upcoming === 0 ? <span className="text-muted-foreground">No upcoming posts.</span> : (
            <>
              {plural(s.upcoming, "post")} planned
              {s.placeholders > 0 && <>, <span className="text-amber-700">{s.placeholders} not written yet</span></>}
              {s.awaiting_client > 0 && <>, {s.awaiting_client} awaiting client approval</>}
              {s.held_for_admin > 0 && <>, <span className="text-amber-700">{s.held_for_admin} held for you</span></>}
              {s.scheduled > 0 && <>, {s.scheduled} scheduled</>}
              {s.published > 0 && <>, {s.published} published</>}
              {s.failed > 0 && <>, <span className="text-red-600">{s.failed} failed</span></>}
              . Images: {s.with_image} ready{s.images_pending > 0 ? `, ${s.images_pending} on the way` : ""}.
            </>
          )}
        </Row>
        <Row icon={Users} title="Prospects">
          {p.total === 0 ? <span className="text-muted-foreground">None found yet.</span> : (
            <>
              {p.total} found. {p.to_review > 0 && <>{p.to_review} to review{p.to_review_no_email > 0 && <> ({p.to_review_no_email} still without an email)</>}. </>}
              {p.in_outreach} in outreach, {p.replied} replied.
            </>
          )}
        </Row>
        <Row icon={Search} title="Search & AI visibility">
          {c.insights.seo_score === null ? "No SEO audit yet" : <>SEO score {c.insights.seo_score} ({ago(c.insights.seo_at)})</>}
          {" · "}
          {c.insights.visibility_score === null ? "AI visibility not checked" : <>AI visibility {Math.round(c.insights.visibility_score)}/100 ({ago(c.insights.visibility_at)})</>}
        </Row>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {c.connections.channels.length === 0 && <Badge variant="destructive">No social accounts</Badge>}
          {c.connections.channels.map((ch) => <Badge key={ch} variant="secondary" className="capitalize">{ch}</Badge>)}
          <Badge variant={c.connections.mailbox ? "secondary" : "outline"}>{c.connections.mailbox ? "Mailbox connected" : "No mailbox"}</Badge>
          <span className="text-muted-foreground">AI this week: {c.ai_7d.calls} calls{c.ai_7d.failed ? `, ${c.ai_7d.failed} failed` : ""}</span>
        </div>
        <div className="flex flex-wrap gap-2 border-t pt-3">
          {jobs.map((j) => <RunButton key={j.key} job={j.key} clientId={c.id} compact />)}
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={isRunning("replan_cycle", c.id)} onClick={() => request("replan_cycle", c.id)}>Re-plan from scratch…</Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onNavigate("social-posts")}>Review posts</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default CommandCenter;
