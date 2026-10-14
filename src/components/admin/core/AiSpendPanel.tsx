import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Info, Lightbulb, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { friendlyEdgeMessage, getEdgeErrorMessage } from "@/lib/edge-error";
import { pricingData, type TierId } from "@/lib/pricingData";
import { cn } from "@/lib/utils";

// ---------- types (mirror admin-ai-spend) ----------

type Status = "no_budget" | "on_track" | "watch" | "will_exceed" | "over";
interface Report {
  generated_at: string;
  month: {
    label: string; spent: number; budget: number | null; pct_of_budget: number | null; forecast: number; status: Status;
    day_of_month: number; days_in_month: number; daily_avg_7d: number; calls: number; failed_calls: number; tokens: number;
  };
  last_month: { spent: number; same_period: number };
  daily: Array<{ day: string; cost: number; calls: number }>;
  areas: Array<{ area: string; label: string; cost: number; calls: number; pct: number }>;
  agents: Array<{ source: string; label: string; what: string; area: string; calls: number; failed: number; tokens: number; cost: number; pct: number }>;
  models: Array<{
    model: string; label: string; provider: string; calls: number; failed: number; prompt_tokens: number; completion_tokens: number;
    cost: number; priced: boolean; input_per_mtok: number | null; output_per_mtok: number | null; verified: boolean;
  }>;
  clients: Array<{ id: string | null; name: string; tier: string | null; status: string | null; calls: number; cost: number; pct: number }>;
  units: Array<{ key: string; label: string; provider: string; note: string | null; this_month: number; last_month: number; unit_cost: number | null; cost: number | null; verified: boolean }>;
  not_included: Array<{ what: string; amount: string }>;
  insights: string[];
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
const rate = (n: number | null) => (n === null ? "—" : `$${n}`);

const STATUS: Record<Status, { bar: string; box: string; icon: typeof Info; text: (r: Report["month"]) => string }> = {
  no_budget: { bar: "bg-sky-500", box: "border-sky-200 bg-sky-50 text-sky-900", icon: Info, text: () => "No monthly budget set yet. Set one below to track your pace." },
  on_track: { bar: "bg-emerald-500", box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: CheckCircle2, text: () => "On track: you're pacing under your budget." },
  watch: { bar: "bg-amber-500", box: "border-amber-200 bg-amber-50 text-amber-900", icon: AlertTriangle, text: () => "Watch this: you're on pace to use most of your budget." },
  will_exceed: { bar: "bg-orange-500", box: "border-orange-200 bg-orange-50 text-orange-900", icon: AlertTriangle, text: () => "At this pace you'll go over your budget before the month ends." },
  over: { bar: "bg-red-500", box: "border-red-200 bg-red-50 text-red-900", icon: AlertTriangle, text: () => "You've already spent more than your monthly budget." },
};

// ---------- component ----------

export function AiSpendPanel({ adminPassword }: { adminPassword: string }) {
  const queryClient = useQueryClient();
  const [budgetInput, setBudgetInput] = useState("");

  const q = useQuery({
    queryKey: ["ai-spend", adminPassword],
    queryFn: () => api<Report>(adminPassword, { action: "overview" }),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    enabled: !!adminPassword,
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(adminPassword, body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ai-spend"] }); toast({ title: "Saved" }); },
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

  const r = q.data;
  const m = r.month;
  const st = STATUS[m.status];
  const StIcon = st.icon;
  const barPct = m.budget ? Math.min(100, (m.spent / m.budget) * 100) : 0;
  const forecastPct = m.budget ? Math.min(100, (m.forecast / m.budget) * 100) : 0;
  const maxDaily = Math.max(0.01, ...r.daily.map((d) => d.cost));
  const images = r.units.find((u) => u.key === "image_gpt_image_2");
  const unpricedModels = r.models.filter((x) => !x.priced);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Spend &amp; Budget</h1>
          <p className="text-sm text-muted-foreground">What the platform's AI costs to run, where it goes, and whether you're on budget.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={cn("mr-2 h-4 w-4", q.isFetching && "animate-spin")} />Refresh
        </Button>
      </div>

      {/* Hero: spend vs budget */}
      <Card><CardContent className="space-y-5 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{m.label} so far (day {m.day_of_month} of {m.days_in_month})</p>
            <p className="text-5xl font-bold tracking-tight">{money(m.spent)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              On pace for about <span className="font-semibold text-foreground">{money(m.forecast)}</span> by month end
              <span className="text-xs"> (based on the last 7 days, about {money(m.daily_avg_7d)} a day)</span>
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label htmlFor="budget" className="text-xs text-muted-foreground">Monthly budget (USD)</label>
              <Input id="budget" type="number" min="0" step="1" placeholder={m.budget ? String(m.budget) : "e.g. 50"} value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} className="w-36" />
            </div>
            <Button disabled={save.isPending || budgetInput === ""} onClick={() => { save.mutate({ action: "set_budget", amount: Number(budgetInput) }); setBudgetInput(""); }}>Save budget</Button>
            {m.budget && <Button variant="ghost" onClick={() => save.mutate({ action: "set_budget", amount: 0 })}>Clear</Button>}
          </div>
        </div>

        {m.budget ? (
          <div className="space-y-2">
            <div className="relative h-4 overflow-hidden rounded-full bg-muted">
              <div className="absolute inset-y-0 left-0 bg-foreground/10" style={{ width: `${forecastPct}%` }} title="Projected by month end" />
              <div className={cn("absolute inset-y-0 left-0", st.bar)} style={{ width: `${barPct}%` }} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{money(m.spent)} spent ({m.pct_of_budget}% of budget)</span>
              <span>Budget {money(m.budget)} · pale bar = projected month end</span>
            </div>
          </div>
        ) : null}

        <div className={cn("flex items-center gap-3 rounded-lg border p-3 text-sm font-medium", st.box)}>
          <StIcon className="h-5 w-5 shrink-0" />{st.text(m)}
        </div>

        {r.not_included.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">This total is a minimum. It does not yet include:</p>
            <ul className="mt-1 list-inside list-disc text-xs">
              {r.not_included.map((n) => <li key={n.what}>{n.what}: {n.amount}</li>)}
            </ul>
            <p className="mt-1 text-xs">Enter the missing prices in the price list at the bottom of this page to include them.</p>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Estimated from how much AI the platform used and the price list below. Confirm against your OpenAI and Groq invoices.</p>
      </CardContent></Card>

      {/* Plain-English takeaways */}
      <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="h-5 w-5 text-amber-500" />What this means</CardTitle></CardHeader>
        <CardContent><ul className="space-y-2 text-sm">{r.insights.map((i) => <li key={i} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40" />{i}</li>)}</ul></CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Last month (total)" value={money(r.last_month.spent)} sub={`${money(r.last_month.same_period)} by this day`} />
        <Kpi label="Average per day" value={money(m.daily_avg_7d)} sub="last 7 days" />
        <Kpi label="AI requests this month" value={m.calls.toLocaleString("en-US")} sub={m.failed_calls ? `${m.failed_calls} failed` : "none failed"} warn={m.failed_calls > 0} />
        <Kpi label="AI usage this month" value={compact(m.tokens)} sub="tokens (≈ ¾ of a word each)" />
        <Kpi label="Images made" value={String(images?.this_month ?? 0)} sub={`${images?.last_month ?? 0} last month`} />
      </div>

      {/* Daily chart */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Daily spend, last 30 days</h2>
        <Card><CardContent className="p-4">
          <div className="flex h-36 items-end gap-1">
            {r.daily.map((d) => (
              <div key={d.day} className="group relative flex-1" title={`${d.day}: ${money(d.cost)} · ${d.calls} requests`}>
                <div className={cn("w-full rounded-t", d.cost > 0 ? "bg-primary/70 group-hover:bg-primary" : "bg-muted")} style={{ height: `${Math.max(2, (d.cost / maxDaily) * 100)}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>{r.daily[0]?.day}</span><span>today</span></div>
        </CardContent></Card>
      </section>

      {/* By area */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Where the money goes</h2>
        <Card><CardContent className="space-y-3 p-4">
          {r.areas.length === 0 && <p className="text-sm text-muted-foreground">No priced usage yet this month.</p>}
          {r.areas.map((a) => (
            <div key={a.area} className="space-y-1">
              <div className="flex justify-between text-sm"><span className="font-medium">{a.label}</span><span>{money(a.cost)} <span className="text-muted-foreground">({a.pct}%)</span></span></div>
              <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${a.pct}%` }} /></div>
            </div>
          ))}
        </CardContent></Card>
      </section>

      {/* By task */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">What each AI task costs</h2>
        <Card><CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground">
              <th className="p-3 font-medium">Task</th><th className="p-3 font-medium">Requests</th><th className="p-3 font-medium">Usage</th><th className="p-3 text-right font-medium">Cost</th><th className="p-3 text-right font-medium">Share</th>
            </tr></thead>
            <tbody>
              {r.agents.map((a) => (
                <tr key={a.source} className="border-b last:border-0">
                  <td className="p-3"><p className="font-medium">{a.label}</p>{a.what && <p className="text-xs text-muted-foreground">{a.what}</p>}</td>
                  <td className="p-3 text-muted-foreground">{a.calls.toLocaleString("en-US")}{a.failed > 0 && <span className="text-red-600"> ({a.failed} failed)</span>}</td>
                  <td className="p-3 text-muted-foreground">{compact(a.tokens)}</td>
                  <td className="p-3 text-right font-medium">{money(a.cost)}</td>
                  <td className="p-3 text-right text-muted-foreground">{a.pct}%</td>
                </tr>
              ))}
              {r.agents.length === 0 && <tr><td colSpan={5} className="p-4 text-muted-foreground">No AI activity this month yet.</td></tr>}
            </tbody>
          </table>
        </CardContent></Card>
      </section>

      {/* By client */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Cost per client</h2>
        <p className="-mt-2 text-sm text-muted-foreground">AI cost this month against what each client pays per month. Images are not tied to a client, so they are not in this table.</p>
        <Card><CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground">
              <th className="p-3 font-medium">Client</th><th className="p-3 font-medium">Plan</th><th className="p-3 font-medium">Requests</th><th className="p-3 text-right font-medium">AI cost</th><th className="p-3 text-right font-medium">% of what they pay</th>
            </tr></thead>
            <tbody>
              {r.clients.map((c) => {
                const price = c.tier && c.tier in pricingData ? pricingData[c.tier as TierId].price : null;
                const share = price ? (c.cost / price) * 100 : null;
                return (
                  <tr key={c.id ?? "none"} className="border-b last:border-0">
                    <td className="p-3 font-medium">{c.name}</td>
                    <td className="p-3 capitalize text-muted-foreground">{c.tier ? `${c.tier} · $${price}/mo` : "—"}</td>
                    <td className="p-3 text-muted-foreground">{c.calls.toLocaleString("en-US")}</td>
                    <td className="p-3 text-right font-medium">{money(c.cost)}</td>
                    <td className={cn("p-3 text-right", share !== null && share > 10 ? "font-medium text-red-600" : "text-muted-foreground")}>{share === null ? "—" : `${share.toFixed(1)}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent></Card>
      </section>

      {/* Images & lookups */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Images and lookups</h2>
        <p className="-mt-2 text-sm text-muted-foreground">These are charged per item, not per word, so enter what each one costs you (your average from the invoice).</p>
        <Card><CardContent className="divide-y p-0">
          {r.units.map((u) => (
            <div key={u.key} className="flex flex-wrap items-center gap-4 p-4 text-sm">
              <div className="min-w-[200px] flex-1">
                <p className="font-medium">{u.label}</p>
                {u.note && <p className="text-xs text-muted-foreground">{u.note}</p>}
              </div>
              <div className="text-muted-foreground">{u.this_month.toLocaleString("en-US")} this month · {u.last_month.toLocaleString("en-US")} last month</div>
              <UnitPrice unit={u} saving={save.isPending} onSave={(v) => save.mutate({ action: "set_rate", key: u.key, unit_cost: v })} />
              <div className="w-24 text-right font-medium">{u.cost === null ? <Badge variant="outline">Not priced</Badge> : money(u.cost)}</div>
            </div>
          ))}
        </CardContent></Card>
      </section>

      {/* Rate card */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">AI models and their prices</h2>
        <p className="-mt-2 text-sm text-muted-foreground">Prices are per 1 million tokens. The starting prices are estimates from the providers' public price lists, so confirm them against an invoice and edit them here. Retired models stay listed because last month's usage still used them.</p>
        <Card><CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground">
              <th className="p-3 font-medium">Model</th><th className="p-3 font-medium">Used this month</th><th className="p-3 font-medium">Price in</th><th className="p-3 font-medium">Price out</th><th className="p-3 font-medium">Status</th><th className="p-3" />
            </tr></thead>
            <tbody>
              {r.models.map((x) => (
                <ModelRow key={x.model} m={x} saving={save.isPending} onConfirm={() => save.mutate({ action: "set_rate", key: x.model, verified: true })} onSave={(i, o) => save.mutate({ action: "set_rate", key: x.model, label: x.label, provider: x.provider, input_per_mtok: i, output_per_mtok: o })} />
              ))}
              {r.models.length === 0 && <tr><td colSpan={6} className="p-4 text-muted-foreground">No AI models used this month yet.</td></tr>}
            </tbody>
          </table>
        </CardContent></Card>
        {unpricedModels.length > 0 && <p className="text-xs text-amber-700">{unpricedModels.length} model(s) above have no price, so their usage is not in the totals.</p>}
      </section>
    </div>
  );
}

// ---------- pieces ----------

function Kpi({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <Card><CardContent className="space-y-1 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      {sub && <p className={cn("text-xs", warn ? "text-red-600" : "text-muted-foreground")}>{sub}</p>}
    </CardContent></Card>
  );
}

function UnitPrice({ unit, onSave, saving }: { unit: Report["units"][number]; onSave: (v: number | null) => void; saving: boolean }) {
  const [v, setV] = useState("");
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">$ each</span>
      <Input type="number" min="0" step="0.001" placeholder={unit.unit_cost === null ? "e.g. 0.04" : String(unit.unit_cost)} value={v} onChange={(e) => setV(e.target.value)} className="h-8 w-24" />
      <Button size="sm" variant="outline" disabled={saving || v === ""} onClick={() => { onSave(Number(v)); setV(""); }}>Save</Button>
    </div>
  );
}

function ModelRow({ m, onSave, onConfirm, saving }: { m: Report["models"][number]; onSave: (i: number, o: number) => void; onConfirm: () => void; saving: boolean }) {
  const [i, setI] = useState("");
  const [o, setO] = useState("");
  const ready = i !== "" && o !== "";
  return (
    <tr className="border-b last:border-0">
      <td className="p-3"><p className="font-medium">{m.label}</p><p className="text-xs text-muted-foreground">{m.provider} · {m.model}</p></td>
      <td className="p-3 text-muted-foreground">{m.calls.toLocaleString("en-US")} requests · {money(m.cost)}</td>
      <td className="p-3"><Input type="number" min="0" step="0.01" placeholder={rate(m.input_per_mtok)} value={i} onChange={(e) => setI(e.target.value)} className="h-8 w-24" /></td>
      <td className="p-3"><Input type="number" min="0" step="0.01" placeholder={rate(m.output_per_mtok)} value={o} onChange={(e) => setO(e.target.value)} className="h-8 w-24" /></td>
      <td className="p-3">{!m.priced ? <Badge variant="destructive">No price</Badge> : m.verified ? <Badge>Confirmed</Badge> : <Badge variant="outline">Estimate</Badge>}</td>
      <td className="space-x-2 whitespace-nowrap p-3 text-right">
        {m.priced && !m.verified && <Button size="sm" variant="ghost" disabled={saving} onClick={onConfirm} title="The current prices match my invoice">Looks right</Button>}
        <Button size="sm" variant="outline" disabled={saving || !ready} onClick={() => { onSave(Number(i), Number(o)); setI(""); setO(""); }}>Save &amp; confirm</Button>
      </td>
    </tr>
  );
}

export default AiSpendPanel;
