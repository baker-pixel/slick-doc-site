import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Globe, Mail, RefreshCw, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCycleList, useCycleMetrics, type CycleListItem, type CycleMetrics, type CycleWindowMetrics } from "@/hooks/use-cycle-metrics";
import { fmtNum } from "@/lib/analyticsInsights";
import { MIN_EVENTS, compare, cycleDay, fmtRate, perDay, sampleLabel, type Trend } from "@/lib/cycleView";
import { ChannelCard } from "./ChannelCard";
import { GoalCard } from "./GoalCard";
import { ReviewCard } from "./ReviewCard";
import { WhatWeDid } from "./WhatWeDid";

const PLATFORM: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", twitter: "X", threads: "Threads", bluesky: "Bluesky", tiktok: "TikTok",
};

const sumViews = (w: CycleWindowMetrics) => Object.values(w.social.by_platform).reduce((a, p) => a + p.views_total, 0);

/** The cycle's effective end: a cycle closed early ends when it closed, not at its paid period end. */
const effectiveEnd = (c: CycleListItem) =>
  c.status === "closed" && c.closed_at && new Date(c.closed_at) < new Date(c.period_end) ? c.closed_at : c.period_end;

function CycleHeader({ cycles, selected, onSelect }: { cycles: CycleListItem[]; selected: CycleListItem; onSelect: (id: string) => void }) {
  const active = selected.status === "active";
  const day = active ? cycleDay(selected.period_start, selected.period_end, new Date()) : null;
  const end = effectiveEnd(selected);
  return (
    <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5" /> Marketing cycle
          </p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight">Cycle {selected.cycle_no}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {format(new Date(selected.period_start), "MMM d")} – {format(new Date(end), "MMM d, yyyy")}
            <span className="mx-2">·</span>
            <span className={active ? "font-medium text-primary" : ""}>{active ? "In progress" : "Completed"}</span>
          </p>
        </div>
        {cycles.length > 1 && (
          <Select value={selected.id} onValueChange={onSelect}>
            <SelectTrigger className="w-full sm:w-64 rounded-xl bg-card" aria-label="Choose a cycle"><SelectValue /></SelectTrigger>
            <SelectContent>
              {cycles.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  Cycle {c.cycle_no}{c.status === "active" ? " (current)" : ""} · {format(new Date(c.period_start), "MMM d")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {day && (
        <div className="mt-5">
          <div className="h-2 overflow-hidden rounded-full bg-primary/15" role="progressbar" aria-valuemin={0} aria-valuemax={day.total} aria-valuenow={day.day} aria-label="Cycle progress">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(day.day / day.total) * 100}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Day {day.day} of {day.total} · {day.left} {day.left === 1 ? "day" : "days"} left. Early in a cycle the numbers are small; they fill in as it goes.</p>
        </div>
      )}
    </div>
  );
}

function Channels({ m }: { m: CycleMetrics }) {
  const cur = m.current, prev = m.previous?.metrics ?? null;
  const days = cur.window.days;

  // Social: judged on posts that have numbers, not on the size of the numbers.
  const views = sumViews(cur), prevViews = prev ? sumViews(prev) : null;
  const socialTrend: Trend = cur.social.measured >= MIN_EVENTS && (prev?.social.measured ?? 0) >= MIN_EVENTS
    ? compare({ total: views, days }, prev ? { total: prevViews, days: prev.window.days } : null)
    : { state: "too_few" };
  const platforms = Object.entries(cur.social.by_platform).sort((a, b) => b[1].views_total - a[1].views_total);
  const facebookNoViews = platforms.some(([k, v]) => k === "facebook" && v.measured === 0 && v.posts > 0);
  const viewRate = perDay(views, days), prevViewRate = prev && prevViews !== null ? perDay(prevViews, prev.window.days) : null;

  // Outreach: leads found this cycle.
  const o = cur.outreach, po = prev?.outreach ?? null;
  const leadTrend = compare({ total: o.leads, days }, prev && po ? { total: po.leads, days: prev.window.days } : null);
  const leadRate = perDay(o.leads, days), prevLeadRate = prev && po ? perDay(po.leads, prev.window.days) : null;

  // Website: per day that has data. Collection can start mid-cycle, so coverage is stated, not assumed.
  const w = cur.website, pw = prev?.website ?? null;
  const webTrend = compare({ total: w.visits, days: w.days_with_data }, pw ? { total: pw.visits, days: pw.days_with_data } : null);
  const webRate = perDay(w.visits, w.days_with_data), prevWebRate = pw ? perDay(pw.visits, pw.days_with_data) : null;
  const rateLine = (cur: number | null, prev: number | null, unit: string) =>
    cur === null ? undefined : `${fmtRate(cur)} ${unit} a day${prev !== null ? ` · last cycle ${fmtRate(prev)}` : ""}`;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <ChannelCard
        icon={Share2} title="Social media"
        headline={{ value: fmtNum(views), unit: "views" }}
        rateLine={rateLine(viewRate, prevViewRate, "views")}
        trend={socialTrend}
        sample={sampleLabel(cur.social.published, "post")}
        stats={[
          { label: "Posts published", value: fmtNum(cur.social.published) },
          { label: "Posts with numbers", value: fmtNum(cur.social.measured) },
        ]}
        chips={platforms.filter(([, v]) => v.measured > 0).map(([k, v]) => ({ label: PLATFORM[k] ?? k, value: fmtNum(v.views_total) }))}
        chipsTitle="Views by platform"
        footnote={facebookNoViews ? "Facebook doesn't share views, so its posts are counted but not in the views total." : undefined}
      />
      <ChannelCard
        icon={Mail} title="Lead outreach"
        headline={{ value: fmtNum(o.leads), unit: "new leads" }}
        rateLine={rateLine(leadRate, prevLeadRate, "leads")}
        trend={leadTrend}
        sample={sampleLabel(o.leads, "lead")}
        stats={[
          { label: "Real opens", value: fmtNum(o.opens) },
          { label: "Link clicks", value: fmtNum(o.clicks) },
          { label: "Replies", value: fmtNum(o.replies) },
          { label: "Outreach started", value: fmtNum(o.outreach_started) },
        ]}
        footnote="Opens count real people only; automatic mail-security opens are left out."
      />
      <ChannelCard
        icon={Globe} title="Website"
        headline={{ value: fmtNum(w.visits), unit: "visits" }}
        rateLine={w.days_with_data > 0 ? rateLine(webRate, prevWebRate, "visits") : undefined}
        trend={webTrend}
        sample={{ text: `${w.days_with_data} of ${Math.round(w.window_days)} days of data`, thin: w.days_with_data < 5 }}
        stats={[{ label: "Page views", value: fmtNum(w.pageviews) }]}
        chips={w.top_referrers.map((r) => ({ label: r.host, value: fmtNum(r.views) }))}
        chipsTitle="Where visits came from"
        footnote={w.days_with_data < w.window_days ? "Visit counting began partway through, so only the days with data are used." : undefined}
      />
    </div>
  );
}

/** The cycle-first top of the Analytics page: which cycle, how it is going against the goals, what each channel did. */
export function CycleOverview({ clientAccountId }: { clientAccountId: string }) {
  const list = useCycleList(clientAccountId);
  const cycles = useMemo(() => list.data ?? [], [list.data]);
  const [picked, setPicked] = useState<string | undefined>();
  const selected = useMemo(
    () => cycles.find((c) => c.id === picked) ?? cycles.find((c) => c.status === "active") ?? cycles[0],
    [cycles, picked],
  );
  useEffect(() => { if (picked && cycles.length && !cycles.some((c) => c.id === picked)) setPicked(undefined); }, [cycles, picked]);
  const metrics = useCycleMetrics(clientAccountId, selected?.id);

  if (list.isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (list.isError) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card p-5 text-sm text-muted-foreground">
        We couldn't load your cycle results. <Button variant="link" className="h-auto p-0" onClick={() => list.refetch()}>Try again</Button>
      </div>
    );
  }
  if (!selected) return null; // no cycle yet: nothing to show, nothing invented

  const m = metrics.data;
  const goals = (m?.goals ?? []).filter((g) => g.current !== null);
  return (
    <section className="space-y-6" aria-label="Cycle results">
      <CycleHeader cycles={cycles} selected={selected} onSelect={setPicked} />

      {metrics.isLoading && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}</div>
      )}
      {metrics.isError && (
        <div className="rounded-2xl border border-border/50 bg-card p-5 text-sm text-muted-foreground">
          We couldn't load the numbers for this cycle. <Button variant="link" className="h-auto p-0" onClick={() => metrics.refetch()}>Try again</Button>
        </div>
      )}

      {m && (
        <>
          {goals.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold">Your goals</h3>
              <div className={`grid grid-cols-1 gap-4 ${goals.length > 1 ? "lg:grid-cols-2" : ""}`}>{goals.map((g) => <GoalCard key={`${g.engine}-${g.metric}`} goal={g} closed={selected.status !== "active"} />)}</div>
            </div>
          )}
          <div>
            <h3 className="mb-3 text-sm font-semibold">Results this cycle</h3>
            <Channels m={m} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className={selected.plan?.review?.mode === "live" ? "lg:col-span-3" : "lg:col-span-5"}>
              <WhatWeDid
                clientAccountId={clientAccountId}
                start={m.cycle.start} end={m.cycle.end}
                outreach={{ started: m.current.outreach.outreach_started, leads: m.current.outreach.leads }}
                closed={selected.status !== "active"}
              />
            </div>
            {selected.plan?.review?.mode === "live" && <div className="lg:col-span-2"><ReviewCard review={selected.plan.review} /></div>}
          </div>
        </>
      )}
    </section>
  );
}
