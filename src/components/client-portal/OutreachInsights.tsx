import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarClock, ChevronDown, ChevronUp, Mail, Radar, Reply, Search, Send, ShieldAlert, PauseCircle, CheckCircle2 } from "lucide-react";
import {
  OUTREACH_ACTIVITY_TYPES, engineStatus, funnelStages, groupByDay, nextDiscoveryRun, summarizeActivity,
  type ActivityRow, type InsightProspect,
} from "@/lib/outreachInsights";

interface Insights {
  queue: { pending?: number; next_send_at?: string | null; sent_24h?: number };
  upcoming: { scheduled_for: string; subject: string; drip_step: number | null; prospect_id: string; prospect_name: string }[];
  replies: { id: string; received_at: string; prospect_id: string | null; prospect_name: string | null; from_address: string | null; subject: string | null; body: string; classification: string }[];
  daily: { day: string; sent: number; opened: number; replied: number }[];
  bounces_30d: number;
}

interface Props {
  clientAccountId: string;
  /** Every pipeline prospect, including leads still awaiting review. */
  prospects: InsightProspect[];
  hasMailbox: boolean | null;
  onOpenLead: (prospectId: string) => void;
}

const STATE_STYLE = {
  running: { icon: CheckCircle2, ring: "border-emerald-500/40 bg-emerald-500/10", text: "text-emerald-600" },
  paused: { icon: PauseCircle, ring: "border-amber-500/40 bg-amber-500/10", text: "text-amber-600" },
  blocked: { icon: ShieldAlert, ring: "border-orange-500/40 bg-orange-500/10", text: "text-orange-600" },
} as const;

const ACTIVITY_ICON: Record<string, typeof Mail> = {
  prospect_discovery: Search,
  prospect_outreach: Send,
  prospect_replied: Reply,
};

function dayLabel(key: string): string {
  const d = new Date(`${key}T12:00:00`);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE d MMM");
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold truncate">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function OutreachInsights({ clientAccountId, prospects, hasMailbox, onOpenLead }: Props) {
  const [tier, setTier] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [activity, setActivity] = useState<ActivityRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [openReply, setOpenReply] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [ins, act, acct] = await Promise.all([
        (supabase.rpc as any)("client_get_outreach_insights", { p_client_account_id: clientAccountId }),
        supabase
          .from("activity_feed")
          .select("id, activity_type, title, description, created_at, metadata")
          .eq("client_account_id", clientAccountId)
          .in("activity_type", [...OUTREACH_ACTIVITY_TYPES])
          .order("created_at", { ascending: false })
          .limit(150),
        supabase.from("client_accounts").select("tier").eq("id", clientAccountId).single(),
      ]);
      if (cancelled) return;
      if (ins.error) setLoadError(true);
      else { setLoadError(false); setInsights(ins.data as Insights); }
      setActivity((act.data ?? []) as ActivityRow[]);
      setTier((acct.data?.tier as string | null) ?? null);
    };
    load();
    const refresh = () => { if (document.visibilityState === "visible") load(); };
    const poll = setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { cancelled = true; clearInterval(poll); document.removeEventListener("visibilitychange", refresh); };
  }, [clientAccountId]);

  const awaitingReview = prospects.filter((p) => p.status === "discovered").length;
  const lastDiscovery = activity?.find((a) => a.activity_type === "prospect_discovery") ?? null;

  const status = engineStatus({
    tier,
    hasMailbox,
    awaitingReview,
    pendingQueue: insights?.queue.pending ?? 0,
    sent24h: insights?.queue.sent_24h ?? 0,
    lastDiscoveryAt: lastDiscovery?.created_at ?? null,
  });
  const style = STATE_STYLE[status.state];
  const StatusIcon = style.icon;

  const stages = useMemo(() => funnelStages(prospects), [prospects]);
  const top = Math.max(1, stages[0]?.count ?? 1);
  const timeline = useMemo(() => groupByDay(summarizeActivity(activity ?? [])), [activity]);
  const chartData = useMemo(
    () => (insights?.daily ?? []).map((d) => ({ ...d, label: format(new Date(`${d.day}T12:00:00`), "d MMM") })),
    [insights],
  );
  const chartHasData = chartData.some((d) => d.sent || d.opened || d.replied);
  const nextRun = nextDiscoveryRun();

  const cap = status.dailySendCap;
  const sent24h = insights?.queue.sent_24h ?? 0;
  const nextSend = insights?.queue.next_send_at ?? null;

  return (
    <div className="space-y-4">
      {/* Live status */}
      <Card className={`p-4 border ${style.ring}`}>
        <div className="flex items-start gap-3">
          <StatusIcon className={`w-5 h-5 mt-0.5 shrink-0 ${style.text}`} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="font-semibold text-sm">{status.headline}</div>
            <p className="text-sm text-muted-foreground">{status.detail}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-border/50 pt-3">
          <Fact
            label="Next lead search"
            value={status.state === "blocked" ? "On hold" : format(nextRun, "EEE d MMM, h:mm a")}
            sub={status.state === "blocked" ? undefined : `Daily · up to ${status.dailyBatch} new leads`}
          />
          <Fact
            label="Last lead search"
            value={lastDiscovery ? formatDistanceToNowStrict(new Date(lastDiscovery.created_at), { addSuffix: true }) : "Not yet"}
            sub={lastDiscovery?.title}
          />
          <Fact
            label="Emails queued"
            value={insights ? String(insights.queue.pending ?? 0) : "…"}
            sub={nextSend ? `Next ${format(new Date(nextSend), "EEE d MMM, h:mm a")}` : "Nothing scheduled"}
          />
          <Fact
            label="Sent in last 24h"
            value={insights ? (cap > 0 ? `${sent24h} of ${cap}` : String(sent24h)) : "…"}
            sub={cap > 0 ? "Daily limit protects your inbox's reputation" : undefined}
          />
        </div>
        {awaitingReview > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{awaitingReview}</span> new lead{awaitingReview === 1 ? " is" : "s are"} being reviewed
            by the Orange Door team before any email is sent. Nobody is contacted until a lead is approved, then there is a 48-hour hold before the first email.
          </p>
        )}
      </Card>

      {/* Detail tabs */}
      <Card className="p-0 overflow-hidden">
        <Tabs defaultValue="results">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-auto p-0 overflow-x-auto">
            {[
              { v: "results", label: "Results" },
              { v: "activity", label: "Activity" },
              { v: "upcoming", label: "Upcoming", count: insights?.upcoming.length },
              { v: "replies", label: "Replies", count: insights?.replies.length },
            ].map((t) => (
              <TabsTrigger key={t.v} value={t.v} className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 gap-2">
                {t.label}
                {t.count ? <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">{t.count}</Badge> : null}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Results: funnel + trend */}
          <TabsContent value="results" className="p-4 space-y-6 mt-0">
            <div className="space-y-2">
              {stages.map((s, i) => {
                const prev = i === 0 ? null : stages[i - 1].count;
                const conv = prev && prev > 0 ? Math.round((s.count / prev) * 100) : null;
                return (
                  <div key={s.key} title={s.hint}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium">{s.label}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {s.count}{conv !== null && <span className="ml-2 text-xs">{conv}% of {stages[i - 1].label.toLowerCase()}</span>}
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(s.count > 0 ? 2 : 0, (s.count / top) * 100)}%` }} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{s.hint}</div>
                  </div>
                );
              })}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold">Last 30 days</h4>
                {insights && insights.bounces_30d > 0 && (
                  <Badge variant="outline" className="text-xs">{insights.bounces_30d} bounced</Badge>
                )}
              </div>
              {!insights ? (
                <Skeleton className="h-48 w-full" />
              ) : !chartHasData ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No emails sent yet in the last 30 days. Activity will appear here once outreach starts.</p>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="sent" name="Emails sent" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                      <Line type="monotone" dataKey="opened" name="Opened" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="replied" name="Replied" stroke="#10b981" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Activity timeline */}
          <TabsContent value="activity" className="p-4 mt-0">
            {activity === null ? (
              <Skeleton className="h-40 w-full" />
            ) : timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nothing yet. Lead searches, emails and replies will be listed here as they happen.</p>
            ) : (
              <div className="space-y-5">
                {timeline.map((g) => (
                  <div key={g.day}>
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">{dayLabel(g.day)}</div>
                    <ul className="space-y-3 border-l border-border/60 ml-2 pl-4">
                      {g.rows.map((r) => {
                        const Icon = ACTIVITY_ICON[r.activity_type] ?? Radar;
                        const leadId = (r.metadata?.prospect_id as string | undefined) ?? null;
                        return (
                          <li key={r.id} className="relative">
                            <span className="absolute -left-[26px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-background border border-border">
                              <Icon className="w-3 h-3 text-muted-foreground" />
                            </span>
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="text-sm font-medium">{r.title}</span>
                              <span className="text-xs text-muted-foreground shrink-0">{format(new Date(r.created_at), "h:mm a")}</span>
                            </div>
                            {r.description && <p className="text-xs text-muted-foreground line-clamp-2">{r.description}</p>}
                            {leadId && r.activity_type !== "prospect_outreach" && (
                              <button type="button" onClick={() => onOpenLead(leadId)} className="text-xs text-primary hover:underline mt-0.5">View lead</button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Upcoming sends */}
          <TabsContent value="upcoming" className="p-4 mt-0">
            {!insights ? (
              <Skeleton className="h-40 w-full" />
            ) : insights.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No emails are scheduled for the next 7 days.</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5" />
                  Next 7 days. Send times can shift slightly to stay within your daily sending limit, and a lead who replies or unsubscribes is skipped.
                </p>
                <ul className="divide-y divide-border/60">
                  {insights.upcoming.map((u, i) => (
                    <li key={`${u.prospect_id}-${u.drip_step}-${i}`} className="py-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <button type="button" onClick={() => onOpenLead(u.prospect_id)} className="text-sm font-medium hover:underline text-left truncate max-w-full">{u.prospect_name}</button>
                        <div className="text-xs text-muted-foreground truncate">{u.subject}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-medium">{format(new Date(u.scheduled_for), "EEE d MMM, h:mm a")}</div>
                        {u.drip_step ? <div className="text-[11px] text-muted-foreground">Step {u.drip_step}</div> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </TabsContent>

          {/* Replies */}
          <TabsContent value="replies" className="p-4 mt-0">
            {!insights ? (
              <Skeleton className="h-40 w-full" />
            ) : insights.replies.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No replies yet. When a lead writes back, the full message appears here.</p>
            ) : (
              <ul className="space-y-3">
                {insights.replies.map((r) => {
                  const open = openReply === r.id;
                  return (
                    <li key={r.id} className="rounded-lg border border-border/60 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{r.prospect_name ?? r.from_address ?? "Unknown sender"}</div>
                          <div className="text-xs text-muted-foreground truncate">{r.subject}</div>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{format(new Date(r.received_at), "d MMM, h:mm a")}</span>
                      </div>
                      <p className={`mt-2 text-sm whitespace-pre-wrap ${open ? "" : "line-clamp-3"}`}>{r.body || "(no text)"}</p>
                      <div className="mt-2 flex items-center gap-3">
                        {r.body.length > 180 && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs" onClick={() => setOpenReply(open ? null : r.id)}>
                            {open ? <>Show less <ChevronUp className="w-3 h-3" /></> : <>Read full reply <ChevronDown className="w-3 h-3" /></>}
                          </Button>
                        )}
                        {r.prospect_id && (
                          <button type="button" onClick={() => onOpenLead(r.prospect_id!)} className="text-xs text-primary hover:underline">View lead</button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
        </Tabs>
        {loadError && (
          <p className="px-4 pb-3 text-xs text-muted-foreground">Some outreach details couldn't be loaded right now. They'll retry automatically.</p>
        )}
      </Card>
    </div>
  );
}
