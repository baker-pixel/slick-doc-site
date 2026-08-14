import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle2,
  Circle,
  Clock,
  Users,
  Rocket,
  Zap,
  TrendingUp,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";

// Phases are read from the same engines that already track this client's
// real progress -- not a second, parallel task list. Onboarding comes from
// workflow_steps (the seed-tier-workflow chain); SEO/Content/Lead Nurturing
// come from client_projects' self-updating "kind" rows (upsertSeoProject /
// socialStrategy / refreshProspectProject). CRM Setup / Ads & Retargeting
// were removed -- neither had a real integration behind it (no GoHighLevel
// or ad-platform API calls anywhere), so the "done" badge was always a lie:
// clicking either just generated a placeholder deliverable and marked
// itself complete regardless.
type EnginePhase = "seo" | "content" | "lead_nurturing";

const ENGINE_PHASE_BY_KIND: Record<string, EnginePhase> = {
  seo: "seo",
  social: "content",
  prospect: "lead_nurturing",
};

const CLIENT_STEP_TYPES = ["client_form", "client_upload", "client_oauth", "client_approval"];

const phases: { id: string; label: string; icon: typeof Users; color: string }[] = [
  { id: "onboarding", label: "Onboarding", icon: Users, color: "text-blue-500" },
  { id: "lead_nurturing", label: "Lead Nurturing", icon: Zap, color: "text-purple-500" },
  { id: "content", label: "Content", icon: TrendingUp, color: "text-green-500" },
  { id: "seo", label: "SEO", icon: TrendingUp, color: "text-emerald-500" },
];
const phaseOrder = phases.map((p) => p.id);

const tierColors: Record<string, string> = {
  foundation: "bg-slate-500/10 text-slate-600 border-slate-500/30",
  growth: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  transformation: "bg-purple-500/10 text-purple-600 border-purple-500/30",
};

interface ClientWithPhase {
  id: string;
  business_name: string;
  tier: string;
  status: string;
  created_at: string;
  onboarding: { completed: number; total: number } | null;
  enginePct: Partial<Record<EnginePhase, number>>;
  currentPhase: string;
}

interface ClientPhaseTrackerProps {
  adminPassword: string;
}

function isPhaseDone(
  phaseId: string,
  onboarding: ClientWithPhase["onboarding"],
  enginePct: ClientWithPhase["enginePct"],
): boolean {
  if (phaseId === "onboarding") return !!onboarding && onboarding.total > 0 && onboarding.completed === onboarding.total;
  return (enginePct[phaseId as EnginePhase] ?? 0) >= 100;
}

export function ClientPhaseTracker({ adminPassword }: ClientPhaseTrackerProps) {
  const [clients, setClients] = useState<ClientWithPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState<string>("all");
  const [runningAction, setRunningAction] = useState<string | null>(null);

  useEffect(() => {
    fetchClientsWithPhases();
  }, []);

  const fetchClientsWithPhases = async () => {
    setLoading(true);
    try {
      const [{ data: clientsData, error: clientsError }, { data: stepsData, error: stepsError }, { data: projectsData, error: projectsError }] = await Promise.all([
        supabase.from("client_accounts").select("id, business_name, tier, status, created_at").eq("status", "active").order("created_at", { ascending: false }),
        supabase.from("workflow_steps").select("client_id, status").in("task_type", CLIENT_STEP_TYPES),
        supabase.from("client_projects").select("client_account_id, kind, progress_percentage").in("kind", ["seo", "social", "prospect"]),
      ]);

      if (clientsError) throw clientsError;
      if (stepsError) throw stepsError;
      if (projectsError) throw projectsError;

      const onboardingByClient: Record<string, { completed: number; total: number }> = {};
      for (const s of stepsData ?? []) {
        const c = (onboardingByClient[s.client_id] ??= { completed: 0, total: 0 });
        c.total++;
        if (s.status === "completed") c.completed++;
      }

      const engineByClient: Record<string, Partial<Record<EnginePhase, number>>> = {};
      for (const p of projectsData ?? []) {
        const phase = ENGINE_PHASE_BY_KIND[p.kind as string];
        if (!phase) continue;
        (engineByClient[p.client_account_id] ??= {})[phase] = p.progress_percentage ?? 0;
      }

      const clientsWithPhases: ClientWithPhase[] = (clientsData ?? []).map((client) => {
        const onboarding = onboardingByClient[client.id] ?? null;
        const enginePct = engineByClient[client.id] ?? {};

        const currentPhase = !onboarding
          ? "no_workflow"
          : phaseOrder.find((p) => !isPhaseDone(p, onboarding, enginePct)) ?? "complete";

        return { ...client, onboarding, enginePct, currentPhase };
      });

      setClients(clientsWithPhases);
    } catch (err) {
      console.error("Error fetching client phases:", err);
      toast.error("Failed to load client phases");
    } finally {
      setLoading(false);
    }
  };

  const handleSeedWorkflow = async (clientId: string) => {
    setRunningAction(`seed:${clientId}`);
    try {
      const { data, error } = await supabase.functions.invoke("seed-tier-workflow", {
        body: { client_id: clientId, password: adminPassword },
      });
      if (error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to seed onboarding workflow");
      }
      toast.success("Onboarding workflow seeded");
      await fetchClientsWithPhases();
    } catch (err: any) {
      toast.error(err?.message || "Failed to seed onboarding workflow");
    } finally {
      setRunningAction(null);
    }
  };

  // Manual override on top of the daily auto-discover-prospects cron, not a
  // replacement for it -- for a client who just got approved and shouldn't
  // have to wait for tomorrow's 9am run. Always calls discover-prospects
  // (Maps), same default the cron itself uses; it doesn't know a given
  // client's icp.local=false preference for the AI-web-search variant.
  const handleFindProspects = async (clientId: string) => {
    setRunningAction(`prospects:${clientId}`);
    try {
      const { data, error } = await supabase.functions.invoke("discover-prospects", {
        body: { client_id: clientId, password: adminPassword },
      });
      if (error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Prospect discovery failed");
      }
      if (data?.error) throw new Error(data.error);
      toast.success(`Discovered ${data?.discovered ?? 0} prospect(s)`);
      await fetchClientsWithPhases();
    } catch (err: any) {
      toast.error(err?.message || "Prospect discovery failed");
    } finally {
      setRunningAction(null);
    }
  };

  const filteredClients = selectedTier === "all" ? clients : clients.filter((c) => c.tier === selectedTier);

  const getCurrentPhaseInfo = (phaseId: string) => {
    if (phaseId === "no_workflow") return { label: "Not Started", icon: Circle, color: "text-muted-foreground" };
    if (phaseId === "complete") return { label: "All Phases Complete", icon: CheckCircle2, color: "text-emerald-500" };
    return phases.find((p) => p.id === phaseId) || phases[0];
  };

  const phaseChipStatus = (
    phaseId: string,
    client: ClientWithPhase,
  ): { state: "complete" | "in_progress" | "not_started"; detail: string } => {
    if (phaseId === "onboarding") {
      const o = client.onboarding;
      if (!o || o.total === 0) return { state: "not_started", detail: "not seeded" };
      if (o.completed === o.total) return { state: "complete", detail: `${o.completed}/${o.total} steps` };
      return { state: o.completed > 0 ? "in_progress" : "not_started", detail: `${o.completed}/${o.total} steps` };
    }
    const pct = client.enginePct[phaseId as EnginePhase];
    if (pct == null) return { state: "not_started", detail: "no project yet" };
    if (pct >= 100) return { state: "complete", detail: "100%" };
    return { state: pct > 0 ? "in_progress" : "not_started", detail: `${pct}%` };
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Client Phase Tracker
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Client Phase Tracker
          </CardTitle>
          <div className="flex items-center gap-3">
            <Select value={selectedTier} onValueChange={setSelectedTier}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Filter by tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tiers</SelectItem>
                <SelectItem value="foundation">Foundation</SelectItem>
                <SelectItem value="growth">Growth</SelectItem>
                <SelectItem value="transformation">Transformation</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={fetchClientsWithPhases}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Phase Legend */}
        <div className="flex flex-wrap gap-4 mb-6 p-3 bg-muted/50 rounded-lg">
          {phases.map((phase) => (
            <div key={phase.id} className="flex items-center gap-1.5 text-sm">
              <phase.icon className={`h-4 w-4 ${phase.color}`} />
              <span className="text-muted-foreground">{phase.label}</span>
            </div>
          ))}
        </div>

        {filteredClients.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No active clients found</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-4">
              {filteredClients.map((client) => {
                const phaseInfo = getCurrentPhaseInfo(client.currentPhase);
                const PhaseIcon = phaseInfo.icon;

                return (
                  <div key={client.id} className="p-4 border rounded-lg hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold text-foreground truncate">{client.business_name}</h4>
                          <Badge className={tierColors[client.tier] || tierColors.foundation}>{client.tier}</Badge>
                        </div>

                        {/* Current Phase */}
                        <div className="flex items-center gap-2 mb-3">
                          <PhaseIcon className={`h-4 w-4 ${phaseInfo.color}`} />
                          <span className="text-sm font-medium">{phaseInfo.label}</span>
                        </div>

                        {/* Onboarding progress bar, when a workflow exists and isn't done yet */}
                        {client.onboarding && client.onboarding.total > 0 && client.currentPhase === "onboarding" && (
                          <div className="space-y-1.5 mb-3">
                            <Progress value={Math.round((100 * client.onboarding.completed) / client.onboarding.total)} className="h-2" />
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{client.onboarding.completed}/{client.onboarding.total} onboarding steps complete</span>
                            </div>
                          </div>
                        )}

                        {/* Per-phase chips, sourced from workflow_steps / client_projects / automation_jobs */}
                        <TooltipProvider>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {phases.map((phase) => {
                              const { state, detail } = phaseChipStatus(phase.id, client);
                              return (
                                <Tooltip key={phase.id}>
                                  <TooltipTrigger>
                                    <div
                                      className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs border ${
                                        state === "complete"
                                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                                          : state === "in_progress"
                                          ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                                          : "bg-muted text-muted-foreground border-border"
                                      }`}
                                    >
                                      {state === "complete" ? (
                                        <CheckCircle2 className="h-3 w-3" />
                                      ) : state === "in_progress" ? (
                                        <Clock className="h-3 w-3" />
                                      ) : (
                                        <Circle className="h-3 w-3" />
                                      )}
                                      <span>{phase.label.split(" ")[0]}</span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{phase.label}: {detail}</p>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })}
                          </div>
                        </TooltipProvider>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2">
                        {!client.onboarding && (
                          <Button
                            size="sm"
                            onClick={() => handleSeedWorkflow(client.id)}
                            disabled={runningAction === `seed:${client.id}`}
                          >
                            {runningAction === `seed:${client.id}` ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <Zap className="h-4 w-4 mr-2" />
                            )}
                            Seed Onboarding
                          </Button>
                        )}
                        {client.tier !== "foundation" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleFindProspects(client.id)}
                            disabled={runningAction === `prospects:${client.id}`}
                          >
                            {runningAction === `prospects:${client.id}` ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Find Prospects Now
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
