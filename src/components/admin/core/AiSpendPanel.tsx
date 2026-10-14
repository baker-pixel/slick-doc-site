import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle2, Copy, Info, KeyRound, Lightbulb, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { friendlyEdgeMessage, getEdgeErrorMessage } from "@/lib/edge-error";
import { cn } from "@/lib/utils";

// ---------- types (mirror admin-ai-spend / openaiSpend.ts) ----------

type Status = "no_budget" | "on_track" | "watch" | "will_exceed" | "over";
interface Report {
  month: {
    label: string; spent: number; budget: number | null; pct_of_budget: number | null; forecast: number; status: Status;
    day_of_month: number; days_in_month: number; daily_avg_7d: number; openai_requests: number; openai_tokens: number;
  };
  last_month: { spent: number; same_period: number };
  daily: Array<{ day: string; usd: number }>;
  lines: Array<{ line_item: string; usd: number; pct: number; image: boolean }>;
  insights: string[];
  attribution: {
    tasks: Array<{ source: string; label: string; what: string; area: string; calls: number; failed: number; tokens: number; share: number }>;
    clients: Array<{ id: string | null; name: string; tier: string | null; calls: number; tokens: number; share: number }>;
    our_requests: number; our_tokens: number; groq_requests: number;
  };
}
interface Overview {
  state: "ok" | "stale" | "error" | "not_connected";
  problem: { title: string; fix: string; detail?: string } | null;
  fetched_at: string | null;
  usage_available: boolean;
  other_currencies: string[];
  report: Report;
}

// ---------- helpers ----------

async function api<T>(password: string, body: Record<string, unknown>): Promise<T> {
  if (!password) throw new Error("Admin session expired — please log in again");
  const { data, error } = await supabase.functions.invoke("admin-ai-spend", { body: { ...body, password } });
  const msg = await getEdgeErrorMessage(error, data);
  if (msg) throw new Error(friendlyEdgeMessage(msg));
  return data as T;
}

const money = (n: number) => (n === 0 ? "$0.00" : n < 0.01 ? "<$0.01" : n >= 100 ? `$${Math.round(n).toLocaleString("en-US")}` : `$${n.toFixed(2)}`);
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3).toLocaleString("en-US")}K` : String(n));
const ago = (iso: string | null) => (iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "never");

const STATUS: Record<Status, { bar: string; box: string; icon: typeof Info; text: string }> = {
  no_budget: { bar: "bg-sky-500", box: "border-sky-200 bg-sky-50 text-sky-900", icon: Info, text: "No monthly budget set yet. Set one to track your pace." },
  on_track: { bar: "bg-emerald-500", box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: CheckCircle2, text: "On track: you're pacing under your budget." },
  watch: { bar: "bg-amber-500", box: "border-amber-200 bg-amber-50 text-amber-900", icon: AlertTriangle, text: "Watch this: you're on pace to use most of your budget." },
  will_exceed: { bar: "bg-orange-500", box: "border-orange-200 bg-orange-50 text-orange-900", icon: AlertTriangle, text: "At this pace you'll go over your budget before the month ends." },
  over: { bar: "bg-red-500", box: "border-red-200 bg-red-50 text-red-900", icon: AlertTriangle, text: "You've already spent more than your monthly budget." },
};

const SETUP_COMMAND = `read -rs "K?Paste your OpenAI admin key (hidden): " && supabase secrets set OPENAI_ADMIN_KEY="$K" --project-ref axbeaqpjyzzmbvyaofbn`;

// ---------- component ----------

export function AiSpendPanel({ adminPassword }: { adminPassword: string }) {
  const queryClient = useQueryClient();
  const [budgetInput, setBudgetInput] = useState("");

  const q = useQuery({
    queryKey: ["ai-spend", adminPassword],
    queryFn: () => api<Overview>(adminPassword, { action: "overview" }),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    enabled: !!adminPassword,
  });
  const refresh = useMutation({
    mutationFn: () => api<Overview>(adminPassword, { action: "overview", force: true }),
    onSuccess: (data) => queryClient.setQueryData(["ai-spend", adminPassword], data),
    onError: (e) => toast({ title: "Could not refresh", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  });
  const saveBudget = useMutation({
    mutationFn: (amount: number) => api(adminPassword, { action: "set_budget", amount }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ai-spend"] }); toast({ title: "Budget saved" }); },
    onError: (e) => toast({ title: "Could not save", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
  });

  if (q.isLoading) return <div className="flex items-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading AI spend…</div>;
  if (q.error || !q.data) {
    return (
      <Card className="border-red-200"><CardContent className="space-y-3 p-6">
        <p className="font-medium text-red-700">AI spend could not load.</p>
        <p className="text-sm text-muted-foreground">{(q.error as Error | null)?.message ?? "No data came back."}</p>
        <Button variant="outline" size="sm" onClick={() => q.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button>
      </CardContent></Card>
    );
  }

  const o = q.data;
  const r = o.report;
  const m = r.month;
  const live = o.state === "ok" || o.state === "stale";
  const st = STATUS[m.status];
  const StIcon = st.icon;
  const barPct = m.budget ? Math.min(100, (m.spent / m.budget) * 100) : 0;
  const forecastPct = m.budget ? Math.min(100, (m.forecast / m.budget) * 100) : 0;
  const maxDaily = Math.max(0.01, ...r.daily.map((d) => d.usd));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Spend &amp; Budget</h1>
          <p className="text-sm text-muted-foreground">What OpenAI actually bills us, straight from OpenAI.</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {live && <span>From OpenAI · updated {ago(o.fetched_at)}</span>}
          <Button size="sm" variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending || o.state === "not_connected"}>
            <RefreshCw className={cn("mr-2 h-4 w-4", refresh.isPending && "animate-spin")} />Refresh from OpenAI
          </Button>
        </div>
      </div>

      {/* Connection problem or setup */}
      {o.problem && (
        <Card className={cn(o.state === "stale" ? "border-amber-300" : "border-red-200")}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-5 w-5" />{o.problem.title}</CardTitle>
            <CardDescription>{o.problem.fix}{o.state === "stale" && " Showing the last good numbers."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {o.problem.detail && <p className="text-xs text-muted-foreground">OpenAI said: {o.problem.detail}</p>}
            {(o.state === "not_connected" || o.state === "error") && (
              <ol className="list-inside list-decimal space-y-2">
                <li>In OpenAI open <strong>Settings → Admin keys</strong> and create a new admin key. You must be an organization Owner. If it offers permissions, allow reading usage.</li>
                <li>Copy the key (it starts with <code className="rounded bg-muted px-1">sk-admin-</code>). Treat it like a password.</li>
                <li>
                  Run this in Terminal. It asks for the key with the typing hidden, so it never appears on screen:
                  <div className="mt-2 flex items-start gap-2 rounded-md border bg-muted p-2">
                    <code className="flex-1 break-all text-xs">{SETUP_COMMAND}</code>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" title="Copy" onClick={() => { navigator.clipboard.writeText(SETUP_COMMAND); toast({ title: "Copied" }); }}><Copy className="h-4 w-4" /></Button>
                  </div>
                </li>
                <li>Come back and press <strong>Refresh from OpenAI</strong>.</li>
              </ol>
            )}
          </CardContent>
        </Card>
      )}

      {live && o.other_currencies.length > 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">OpenAI also reported charges in {o.other_currencies.join(", ").toUpperCase()}. Only USD is added up here.</p>
      )}

      {/* Hero */}
      <Card><CardContent className="space-y-5 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{m.label} so far (day {m.day_of_month} of {m.days_in_month})</p>
            <p className="text-5xl font-bold tracking-tight">{live ? money(m.spent) : "—"}</p>
            {live && (
              <p className="mt-1 text-sm text-muted-foreground">
                On pace for about <span className="font-semibold text-foreground">{money(m.forecast)}</span> by month end
                <span className="text-xs"> (projection from the last 7 days, about {money(m.daily_avg_7d)} a day)</span>
              </p>
            )}
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label htmlFor="budget" className="text-xs text-muted-foreground">Monthly budget (USD)</label>
              <Input id="budget" type="number" min="0" step="1" placeholder={m.budget ? String(m.budget) : "e.g. 50"} value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} className="w-36" />
            </div>
            <Button disabled={saveBudget.isPending || budgetInput === ""} onClick={() => { saveBudget.mutate(Number(budgetInput)); setBudgetInput(""); }}>Save budget</Button>
            {m.budget && <Button variant="ghost" onClick={() => saveBudget.mutate(0)}>Clear</Button>}
          </div>
        </div>

        {live && m.budget ? (
          <div className="space-y-2">
            <div className="relative h-4 overflow-hidden rounded-full bg-muted">
              <div className="absolute inset-y-0 left-0 bg-foreground/10" style={{ width: `${forecastPct}%` }} title="Projected by month end" />
              <div className={cn("absolute inset-y-0 left-0", st.bar)} style={{ width: `${barPct}%` }} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{money(m.spent)} billed ({m.pct_of_budget}% of budget)</span>
              <span>Budget {money(m.budget)} · pale bar = projected month end</span>
            </div>
          </div>
        ) : null}

        {live && (
          <div className={cn("flex items-center gap-3 rounded-lg border p-3 text-sm font-medium", st.box)}>
            <StIcon className="h-5 w-5 shrink-0" />{st.text}
          </div>
        )}
        <p className="text-xs text-muted-foreground">These dollar amounts are OpenAI's own billing data, not our calculation. OpenAI can take a few hours to post the latest usage, so today's figure may still grow.</p>
      </CardContent></Card>

      {live && (
        <>
          <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="h-5 w-5 text-amber-500" />What this means</CardTitle></CardHeader>
            <CardContent><ul className="space-y-2 text-sm">{r.insights.map((i) => <li key={i} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40" />{i}</li>)}</ul></CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Last month (total)" value={money(r.last_month.spent)} sub={`${money(r.last_month.same_period)} by this day`} />
            <Kpi label="Average per day" value={money(m.daily_avg_7d)} sub="last 7 full days" />
            <Kpi label="Requests to OpenAI" value={o.usage_available ? m.openai_requests.toLocaleString("en-US") : "—"} sub={o.usage_available ? "this month, per OpenAI" : "usage data unavailable"} />
            <Kpi label="Tokens used" value={o.usage_available ? compact(m.openai_tokens) : "—"} sub="this month, per OpenAI (≈ ¾ word each)" />
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Daily spend, last 30 days</h2>
            <Card><CardContent className="p-4">
              <div className="flex h-36 items-end gap-1">
                {r.daily.map((d) => (
                  <div key={d.day} className="group relative flex-1" title={`${d.day}: ${money(d.usd)}`}>
                    <div className={cn("w-full rounded-t", d.usd > 0 ? "bg-primary/70 group-hover:bg-primary" : "bg-muted")} style={{ height: `${Math.max(2, (d.usd / maxDaily) * 100)}%` }} />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>{r.daily[0]?.day}</span><span>today</span></div>
            </CardContent></Card>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">What OpenAI is charging for</h2>
            <p className="-mt-2 text-sm text-muted-foreground">Exactly as OpenAI itemises this month's bill.</p>
            <Card><CardContent className="space-y-3 p-4">
              {r.lines.length === 0 && <p className="text-sm text-muted-foreground">No charges posted yet this month.</p>}
              {r.lines.map((l) => (
                <div key={l.line_item} className="space-y-1">
                  <div className="flex justify-between text-sm"><span className="font-medium">{l.line_item}{l.image && <Badge variant="outline" className="ml-2 text-[10px]">images</Badge>}</span><span>{money(l.usd)} <span className="text-muted-foreground">({l.pct}%)</span></span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${l.pct}%` }} /></div>
                </div>
              ))}
            </CardContent></Card>
          </section>
        </>
      )}

      {/* Attribution: usage only */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Where our AI usage goes</h2>
        <p className="-mt-2 text-sm text-muted-foreground">OpenAI doesn't say which task or client caused a charge, so this shows how much each one <em>used</em> (requests and tokens from our own logs), not dollars. The task that uses the most is the first place to look for savings.</p>
        <Card><CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground">
              <th className="p-3 font-medium">Task</th><th className="p-3 font-medium">Requests</th><th className="p-3 font-medium">Tokens</th><th className="p-3 text-right font-medium">Share of usage</th>
            </tr></thead>
            <tbody>
              {r.attribution.tasks.map((t) => (
                <tr key={t.source} className="border-b last:border-0">
                  <td className="p-3"><p className="font-medium">{t.label}</p>{t.what && <p className="text-xs text-muted-foreground">{t.what}</p>}</td>
                  <td className="p-3 text-muted-foreground">{t.calls.toLocaleString("en-US")}{t.failed > 0 && <span className="text-red-600"> ({t.failed} failed)</span>}</td>
                  <td className="p-3 text-muted-foreground">{compact(t.tokens)}</td>
                  <td className="p-3 text-right"><span className="font-medium">{t.share}%</span></td>
                </tr>
              ))}
              {r.attribution.tasks.length === 0 && <tr><td colSpan={4} className="p-4 text-muted-foreground">No AI activity this month yet.</td></tr>}
            </tbody>
          </table>
        </CardContent></Card>

        <Card><CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground">
              <th className="p-3 font-medium">Client</th><th className="p-3 font-medium">Plan</th><th className="p-3 font-medium">Requests</th><th className="p-3 font-medium">Tokens</th><th className="p-3 text-right font-medium">Share of usage</th>
            </tr></thead>
            <tbody>
              {r.attribution.clients.map((c) => (
                <tr key={c.id ?? "none"} className="border-b last:border-0">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3 capitalize text-muted-foreground">{c.tier ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">{c.calls.toLocaleString("en-US")}</td>
                  <td className="p-3 text-muted-foreground">{compact(c.tokens)}</td>
                  <td className="p-3 text-right font-medium">{c.share}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
        {r.attribution.groq_requests > 0 && <p className="text-xs text-muted-foreground">Not included above: {r.attribution.groq_requests.toLocaleString("en-US")} requests this month ran on Groq (our backup provider), which is billed separately and not shown here.</p>}
        <p className="text-xs text-muted-foreground">Image generation is billed by OpenAI but isn't tied to a client or task in our logs, so it appears only in the charges list above.</p>
      </section>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card><CardContent className="space-y-1 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </CardContent></Card>
  );
}

export default AiSpendPanel;
