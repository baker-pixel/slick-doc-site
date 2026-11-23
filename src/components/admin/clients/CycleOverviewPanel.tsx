import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

interface StepRecord { status: "ok" | "skipped" | "error"; detail?: string; retry_when_ready?: boolean }

interface CycleOverviewRow {
  id: string;
  business_name: string;
  cycle_no: number;
  period_start: string;
  period_end: string;
  status: string;
  trigger_source: string | null;
  plan: { steps?: Record<string, StepRecord>; attempts?: number; issues?: string[]; discovery?: { focus?: string | null } } | null;
  digest: { learned?: string[]; social?: { repeated_topics?: string[] } } | null;
  ai_calls: number;
  ai_failed: number;
  ai_prompt_tokens: number;
  ai_completion_tokens: number;
  posts_total: number;
  posts_tagged: number;
}

const STEP_LABELS: Record<string, string> = {
  learn: "Learn",
  social_strategy: "Strategy",
  social_schedule: "Schedule",
  prospect_discovery: "Prospects",
};

const stepVariant = (s: StepRecord) =>
  s.status === "ok" ? "default" : s.status === "error" ? "destructive" : "secondary";

/** Admin view: every client's work cycles, what each planning step did, and the AI cost. */
export default function CycleOverviewPanel() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-cycle-overview"],
    staleTime: 30_000,
    queryFn: async () => {
      // admin_cycle_overview is newer than the generated types.
      const { data, error } = await (supabase.rpc as any)("admin_cycle_overview", { p_limit: 100 });
      if (error) throw error;
      return (data ?? []) as CycleOverviewRow[];
    },
  });

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (error) return <p className="text-sm text-destructive">Could not load cycles: {(error as Error).message}</p>;
  if (!data?.length) return <p className="text-sm text-muted-foreground">No cycles yet. The first starts when a client's invoice is paid.</p>;

  return (
    <div className="space-y-4">
      {data.map((c) => {
        const steps = Object.entries(c.plan?.steps ?? {});
        const warnings = [
          ...(c.plan?.issues ?? []),
          ...(c.digest?.social?.repeated_topics?.length ? [`Repeated topics: ${c.digest.social.repeated_topics.join(", ")}`] : []),
          ...(c.posts_total > 0 && c.posts_tagged === 0 ? ["None of this cycle's posts are tagged to it."] : []),
        ];
        return (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {c.business_name} — cycle {c.cycle_no}
                <Badge variant={c.status === "failed" ? "destructive" : "outline"}>{c.status}</Badge>
                <span className="text-xs font-normal text-muted-foreground">
                  {format(new Date(c.period_start), "MMM d")} – {format(new Date(c.period_end), "MMM d, yyyy")}
                  {c.trigger_source ? ` · via ${c.trigger_source}` : ""}
                  {c.plan?.attempts ? ` · ${c.plan.attempts} attempt${c.plan.attempts > 1 ? "s" : ""}` : ""}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                {steps.length === 0 && <span className="text-muted-foreground">No steps recorded yet.</span>}
                {steps.map(([name, r]) => (
                  <Badge key={name} variant={stepVariant(r)} title={r.detail}>
                    {STEP_LABELS[name] ?? name}: {r.status}{r.detail ? ` (${r.detail})` : ""}{r.retry_when_ready ? " · will retry" : ""}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
                <span>Posts: {c.posts_total} in period ({c.posts_tagged} tagged)</span>
                <span>AI calls: {c.ai_calls}{c.ai_failed ? ` (${c.ai_failed} failed)` : ""}</span>
                <span>Tokens: {(c.ai_prompt_tokens + c.ai_completion_tokens).toLocaleString()}</span>
                {c.plan?.discovery?.focus && <span>Focus: {c.plan.discovery.focus}</span>}
              </div>
              {warnings.map((w) => (
                <p key={w} className="flex items-start gap-2 text-amber-600">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {w}
                </p>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
