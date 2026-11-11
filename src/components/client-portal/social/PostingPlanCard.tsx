import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, CalendarDays, Info, Minus, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { useChannelPlan } from "@/hooks/use-channel-plan";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import { allocateCounts, earliestNewSlot, nextSchedulerRun, remainingSlots, slotShortfall, validateChannelPlan, windowQuota } from "@/lib/channelPlan";
import { cn } from "@/lib/utils";

interface ChannelMeta {
  key: string;
  label: string;
  tag: string;
  chip: string;
}

// Chips carry a text tag as well as a colour, so channels are never told apart by hue alone.
const CHANNELS: ChannelMeta[] = [
  { key: "facebook", label: "Facebook", tag: "FB", chip: "bg-blue-100 text-blue-900" },
  { key: "instagram", label: "Instagram", tag: "IG", chip: "bg-pink-100 text-pink-900" },
  { key: "linkedin", label: "LinkedIn", tag: "LI", chip: "bg-teal-100 text-teal-900" },
  { key: "twitter", label: "Twitter", tag: "TW", chip: "bg-stone-200 text-stone-900" },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Scheduling runs on UTC dates, so the day is named in UTC: "Mon, Nov 16".
function fmtUtcDay(d: Date): string {
  return `${DOW[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

type Mode = "even" | "custom";

function mondayOf(d: Date): number {
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = new Date(utc).getUTCDay(); // 0 = Sunday
  return utc - ((dow + 6) % 7) * DAY_MS;
}

interface PostingPlanCardProps {
  clientAccountId: string;
  /** Shown inside client onboarding: explains the step and offers a way on to the next one. */
  onboarding?: boolean;
  onContinue?: () => void;
}

/**
 * Lets a client choose which channels we post on and how their monthly post quota is split
 * between them, with a calendar preview of exactly what will be scheduled. Saved through
 * save-channel-plan, which re-validates everything; the scheduler then follows the plan.
 */
export function PostingPlanCard({ clientAccountId, onboarding = false, onContinue }: PostingPlanCardProps) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useChannelPlan(clientAccountId);

  const [on, setOn] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<Mode>("even");
  const [custom, setCustom] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [initialised, setInitialised] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);

  // Seed the form once from what is saved (or sensible defaults for a first plan).
  useEffect(() => {
    if (!data || initialised) return;
    const connected = new Set(data.connected);
    const active = data.saved.filter((r) => r.active && connected.has(r.platform));
    if (active.length > 0) {
      setOn(Object.fromEntries(CHANNELS.map((c) => [c.key, active.some((r) => r.platform === c.key)])));
      const equal = active.every((r) => r.weight === active[0].weight);
      setMode(equal ? "even" : "custom");
      setCustom(Object.fromEntries(active.map((r) => [r.platform, r.weight])));
    } else {
      setOn(Object.fromEntries(CHANNELS.map((c) => [c.key, connected.has(c.key)])));
      setMode("even");
    }
    setInitialised(true);
  }, [data, initialised]);

  const connected = useMemo(() => new Set(data?.connected ?? []), [data]);
  const activeKeys = useMemo(
    () => CHANNELS.filter((c) => connected.has(c.key) && on[c.key]).map((c) => c.key),
    [connected, on],
  );
  const quota = data?.postsPerMonth ?? 0;

  // What the client sees in the "split" step: posts per month per channel.
  const counts = useMemo(() => {
    if (mode === "even") return allocateCounts(Object.fromEntries(activeKeys.map((k) => [k, 1])), quota);
    return Object.fromEntries(activeKeys.map((k) => [k, custom[k] ?? 0]));
  }, [mode, activeKeys, custom, quota]);

  const allocated = activeKeys.reduce((s, k) => s + (counts[k] ?? 0), 0);

  const check = useMemo(
    () =>
      validateChannelPlan(
        {
          mode,
          channels: CHANNELS.filter((c) => connected.has(c.key)).map((c) => ({
            platform: c.key,
            active: !!on[c.key],
            count: mode === "custom" ? (custom[c.key] ?? 0) : undefined,
          })),
        },
        { connected, quota },
      ),
    [mode, on, custom, connected, quota],
  );

  // The preview runs the scheduler's own function over the target window.
  const preview = useMemo(() => {
    if (!data || activeKeys.length === 0) return null;
    const { start, end } = data.target;
    const weights = mode === "even"
      ? Object.fromEntries(activeKeys.map((k) => [k, 1]))
      : Object.fromEntries(activeKeys.map((k) => [k, Math.max(0, custom[k] ?? 0)]));
    const windowCounts = allocateCounts(weights, windowQuota(quota, start, end));
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    // Slots are created by the scheduler's next run, not at the click, and never closer than a
    // day to that moment -- so that is what the preview has to show. A next cycle is scheduled
    // from its first day, so it needs no such floor.
    const slots = remainingSlots({
      counts: windowCounts,
      connected: new Set(activeKeys),
      existing: data.existing,
      rangeStart: start,
      rangeEnd: end,
      todayStart,
      notBefore: data.target.kind === "next" ? undefined : earliestNewSlot(nextSchedulerRun()),
    });
    const shortfall = slotShortfall({ counts: windowCounts, existing: data.existing, placed: slots });
    const byDay = new Map<string, string[]>();
    for (const s of slots) {
      const key = s.at.toISOString().slice(0, 10);
      byDay.set(key, [...(byDay.get(key) ?? []), s.platform]);
    }
    const gridStart = mondayOf(start);
    const weekCount = Math.max(1, Math.ceil((end.getTime() - gridStart) / (7 * DAY_MS)));
    const weeks = Array.from({ length: weekCount }, (_, w) =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(gridStart + (w * 7 + i) * DAY_MS);
        const inWindow = d.getTime() >= start.getTime() - DAY_MS + 1 && d.getTime() < end.getTime();
        return { d, inWindow, platforms: byDay.get(d.toISOString().slice(0, 10)) ?? [] };
      }),
    );
    return { weeks, total: slots.length, windowCounts, shortfall };
  }, [data, mode, custom, quota, activeKeys]);

  const setCount = (key: string, value: number) => setCustom((c) => ({ ...c, [key]: Math.max(0, value) }));

  const switchToCustom = () => {
    // Start from the current even split so nothing jumps.
    setCustom((c) => ({ ...c, ...Object.fromEntries(activeKeys.map((k) => [k, counts[k] ?? 0])) }));
    setMode("custom");
  };

  const handleSave = async () => {
    if (!check.ok) return;
    setSaving(true);
    try {
      const { data: res, error: fnError } = await supabase.functions.invoke("save-channel-plan", {
        body: {
          clientAccountId,
          mode,
          channels: CHANNELS.filter((c) => connected.has(c.key)).map((c) => ({
            platform: c.key,
            active: !!on[c.key],
            count: mode === "custom" ? (custom[c.key] ?? 0) : undefined,
          })),
        },
      });
      if (fnError || res?.error) {
        const msg = await getEdgeErrorMessage(fnError, res);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Please try again.");
      }
      setSavedOnce(true);
      toast({ title: "Posting plan saved", description: whenItStarts(res?.applies) });
      await queryClient.invalidateQueries({ queryKey: ["channel-plan", clientAccountId] });
      await queryClient.invalidateQueries({ queryKey: ["client-cycles", clientAccountId] });
    } catch (e) {
      toast({
        title: "Couldn't save your plan",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Saving only stores the plan. Calendar slots are created by the scheduler's next run (weekly,
  // or when a cycle starts), then written and sent for approval -- say so rather than imply it is instant.
  const nextRun = nextSchedulerRun();
  const cycleEnd = data?.cycle ? new Date(data.cycle.period_end) : null;
  function whenItStarts(applies: "current_cycle" | "next_cycle" | undefined): string {
    if (applies === "next_cycle" || (cycleEnd && nextRun.getTime() >= cycleEnd.getTime())) {
      return cycleEnd
        ? `Your plan starts with your next cycle (${fmtUtcDay(cycleEnd)}). Posts already scheduled this cycle stay as they are.`
        : "Your new split starts with your next cycle.";
    }
    return `Your calendar won't change right away. The posts this adds are scheduled at our next scheduling run (${fmtUtcDay(nextRun)}), then written and sent to you for approval.`;
  }

  if (isLoading || (data && !initialised)) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (error || !data) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          We couldn't load your posting plan. Please refresh and try again.
        </CardContent>
      </Card>
    );
  }

  const targetNote =
    data.target.kind === "next"
      ? `Changes you save here start with your next cycle (${format(data.target.start, "MMM d")}). Posts already scheduled this cycle stay as they are.`
      : data.target.kind === "current"
        ? `This is your first plan. Saving doesn't change your calendar straight away: the posts it adds are scheduled at our next scheduling run (${fmtUtcDay(nextRun)}), then written and sent to you for approval.`
        : "Showing the next 4 weeks.";
  const previewTitle =
    data.target.kind === "next" ? "Your next cycle" : data.target.kind === "current" ? "Rest of this cycle" : "Next 4 weeks";
  const shortfallRows = preview
    ? CHANNELS.filter((c) => (preview.shortfall[c.key] ?? 0) > 0).map((c) => ({ label: c.label, n: preview.shortfall[c.key] }))
    : [];
  // Channels the saved plan still lists but that are no longer connected: their posts are skipped, not moved.
  const droppedChannels = CHANNELS.filter((c) => data.saved.some((r) => r.active && r.platform === c.key) && !connected.has(c.key));
  const diff = quota - allocated;
  const progress = quota > 0 ? Math.min(100, Math.round((allocated / quota) * 100)) : 0;
  const noChannelsConnected = data.connected.length === 0;

  return (
    <div className="space-y-6">
      {onboarding && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm">
          <p className="font-medium">Last setup choice: how should your {quota} posts a month be split?</p>
          <p className="mt-1 text-muted-foreground">
            Pick the channels and numbers below and save. You can skip this and change it any time; if you skip, we use our standard weekly schedule.
          </p>
        </div>
      )}

      <div className="flex gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>{targetNote}</p>
      </div>

      {droppedChannels.length > 0 && (
        <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="status">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            {droppedChannels.map((c) => c.label).join(", ")} {droppedChannels.length === 1 ? "is" : "are"} in your saved plan but not connected,
            so no posts are scheduled there. Reconnect in the Connected Accounts tab, or save the plan without {droppedChannels.length === 1 ? "it" : "them"}.
          </p>
        </div>
      )}

      {noChannelsConnected && (
        <Card>
          <CardContent className="pt-6 text-sm">
            No social accounts are connected yet. Connect one in the Connected Accounts tab, then choose how to split your posts here.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">1. Channels</CardTitle>
              <CardDescription>Only connected accounts can be turned on.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {CHANNELS.map((c) => {
                const isConnected = connected.has(c.key);
                const isOn = isConnected && !!on[c.key];
                return (
                  <div
                    key={c.key}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3",
                      isOn ? "border-primary bg-primary/5" : "bg-card",
                      !isConnected && "opacity-70",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{c.label}</div>
                      <div className="text-xs text-muted-foreground">{isConnected ? "Connected" : "Not connected yet"}</div>
                    </div>
                    {isConnected ? (
                      <Switch
                        checked={isOn}
                        onCheckedChange={(v) => setOn((s) => ({ ...s, [c.key]: v }))}
                        aria-label={`${isOn ? "Turn off" : "Turn on"} ${c.label}`}
                      />
                    ) : (
                      <span className="text-xs font-medium text-amber-700">Connect to enable</span>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">2. Split your {quota} posts a month</CardTitle>
              <CardDescription>Each post counts once, on the channel it is published to.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button type="button" variant={mode === "even" ? "default" : "outline"} aria-pressed={mode === "even"} onClick={() => setMode("even")}>
                  Even split
                </Button>
                <Button type="button" variant={mode === "custom" ? "default" : "outline"} aria-pressed={mode === "custom"} onClick={switchToCustom}>
                  Custom
                </Button>
              </div>

              {activeKeys.length === 0 ? (
                <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">No channels on yet. Turn one on above.</p>
              ) : (
                <div className="space-y-2">
                  {CHANNELS.filter((c) => activeKeys.includes(c.key)).map((c) => {
                    const n = counts[c.key] ?? 0;
                    return (
                      <div key={c.key} className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                        <span className={cn("rounded px-2 py-1 text-xs font-bold", c.chip)}>{c.tag}</span>
                        <span className="flex-1 font-medium">{c.label}</span>
                        {mode === "custom" && (
                          <Button type="button" variant="outline" size="icon" disabled={n <= 0} onClick={() => setCount(c.key, n - 1)} aria-label={`One fewer ${c.label} post`}>
                            <Minus className="h-4 w-4" />
                          </Button>
                        )}
                        <span className="w-8 text-center text-xl font-bold tabular-nums">{n}</span>
                        {mode === "custom" && (
                          <Button type="button" variant="outline" size="icon" onClick={() => setCount(c.key, n + 1)} aria-label={`One more ${c.label} post`}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex justify-between text-sm font-medium">
                  <span>Allocated</span>
                  <span>{allocated} of {quota}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", check.ok ? "bg-green-600" : diff < 0 ? "bg-red-600" : "bg-amber-600")}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className={cn("text-sm font-medium", check.ok ? "text-green-700" : "text-amber-700")} role="status">
                  {check.ok ? `All ${quota} posts allocated.` : (check as { ok: false; error: string }).error}
                </p>
              </div>
            </CardContent>
          </Card>

          <Button type="button" className="w-full" size="lg" disabled={!check.ok || saving || noChannelsConnected} onClick={handleSave}>
            {saving ? "Saving…" : "Save posting plan"}
          </Button>
          {onboarding && onContinue && (
            <Button type="button" variant={savedOnce ? "default" : "outline"} className="w-full" size="lg" onClick={onContinue}>
              {savedOnce ? "Continue to approvals" : "Skip for now and continue"}
            </Button>
          )}
        </div>

        <Card className="self-start">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CalendarDays className="h-5 w-5" aria-hidden="true" />
                  Preview: {previewTitle}
                </CardTitle>
                <CardDescription>
                  {format(data.target.start, "MMM d")} – {format(new Date(data.target.end.getTime() - 1), "MMM d")}.
                  Channels take turns, so you never get two on the same day while there's room.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CHANNELS.filter((c) => activeKeys.includes(c.key)).map((c) => (
                  <Badge key={c.key} variant="secondary" className={cn("border-0", c.chip)}>
                    {c.label} {preview?.windowCounts[c.key] ?? 0}
                  </Badge>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!preview ? (
              <p className="text-sm text-muted-foreground">Turn on a channel to see how your posts will be scheduled.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[36rem] space-y-1.5">
                  <div className="grid grid-cols-7 gap-1.5">
                    {WEEKDAYS.map((d) => (
                      <div key={d} className="px-1 text-xs font-semibold text-muted-foreground">{d}</div>
                    ))}
                  </div>
                  {preview.weeks.map((week, wi) => (
                    <div key={wi} className="grid grid-cols-7 gap-1.5">
                      {week.map(({ d, inWindow, platforms }) => (
                        <div
                          key={d.toISOString()}
                          className={cn(
                            "flex min-h-[4.5rem] flex-col gap-1 rounded-md border p-1.5",
                            inWindow ? "bg-card" : "border-transparent bg-muted/40",
                          )}
                        >
                          <div className={cn("text-xs font-semibold", inWindow ? "text-foreground/80" : "text-muted-foreground")}>
                            {d.getUTCDate() === 1 || (wi === 0 && d.getUTCDay() === 1) ? `${MONTHS[d.getUTCMonth()]} ` : ""}
                            {d.getUTCDate()}
                          </div>
                          {platforms.map((p, i) => {
                            const meta = CHANNELS.find((c) => c.key === p);
                            return (
                              <span key={`${p}-${i}`} className={cn("rounded px-1.5 py-0.5 text-xs font-bold", meta?.chip)}>
                                {meta?.tag ?? p}
                              </span>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ))}
                  {data.existing.length > 0 && (
                    <p className="pt-2 text-xs text-muted-foreground">
                      Posts already scheduled aren't shown here. Only the ones still to be added are.
                    </p>
                  )}
                  {shortfallRows.length > 0 && (
                    <div className="mt-2 flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="status">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <p>
                        Not every post fits in this window:{" "}
                        {shortfallRows.map((r) => `${r.n} ${r.label} ${r.n === 1 ? "post" : "posts"}`).join(", ")} can't be scheduled
                        (no free days left, or too close to today to be written and approved in time).
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
