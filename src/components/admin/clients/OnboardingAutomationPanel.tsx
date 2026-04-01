import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Rocket, CheckCircle, Circle, Play, Mail, Calendar, Star, BarChart3, RefreshCw } from "lucide-react";
import { format } from "date-fns";

interface ClientOnboarding {
  id: string;
  client_account_id: string;
  intake_form_sent_at: string | null;
  intake_form_completed_at: string | null;
  crm_added_at: string | null;
  kickoff_scheduled_at: string | null;
  kickoff_completed_at: string | null;
  review_system_setup_at: string | null;
  dashboard_created_at: string | null;
  onboarding_completed_at: string | null;
  current_step: number;
  notes: string | null;
  created_at: string;
  client_accounts?: {
    business_name: string;
    email: string;
    tier: string;
    first_name: string | null;
  };
}

const ONBOARDING_STEPS = [
  { key: "intake_form_sent_at", label: "Send Intake Form", icon: Mail, automation: "send_intake_form" },
  { key: "crm_added_at", label: "Add to CRM", icon: BarChart3, automation: "add_to_crm" },
  { key: "kickoff_scheduled_at", label: "Schedule Kickoff", icon: Calendar, automation: "schedule_kickoff" },
  { key: "intake_form_completed_at", label: "Intake Completed", icon: CheckCircle, automation: null },
  { key: "kickoff_completed_at", label: "Kickoff Completed", icon: CheckCircle, automation: null },
  { key: "review_system_setup_at", label: "Setup Review System", icon: Star, automation: "setup_reviews" },
  { key: "dashboard_created_at", label: "Create Dashboard", icon: BarChart3, automation: "create_dashboard" },
  { key: "onboarding_completed_at", label: "Complete Onboarding", icon: Rocket, automation: null },
];

export function OnboardingAutomationPanel() {
  const [onboardings, setOnboardings] = useState<ClientOnboarding[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOnboarding, setSelectedOnboarding] = useState<ClientOnboarding | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [runningSteps, setRunningSteps] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchOnboardings();
  }, []);

  const fetchOnboardings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("client_onboarding")
      .select(`
        *,
        client_accounts (
          business_name,
          email,
          tier,
          first_name
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to fetch onboarding data");
      console.error(error);
    } else {
      setOnboardings((data || []) as ClientOnboarding[]);
    }
    setLoading(false);
  };

  const getCompletedSteps = (onboarding: ClientOnboarding) => {
    return ONBOARDING_STEPS.filter(step => 
      onboarding[step.key as keyof ClientOnboarding] !== null
    ).length;
  };

  const runOnboardingStep = async (onboarding: ClientOnboarding, stepKey: string, automationType: string) => {
    const stepId = `${onboarding.id}-${stepKey}`;
    setRunningSteps(prev => new Set([...prev, stepId]));

    try {
      const { data, error } = await supabase.functions.invoke("run-automation", {
        body: {
          clientId: onboarding.client_account_id,
          jobType: automationType,
          metadata: {
            onboardingId: onboarding.id,
            stepKey,
            clientEmail: onboarding.client_accounts?.email,
            clientName: onboarding.client_accounts?.first_name || onboarding.client_accounts?.business_name,
            businessName: onboarding.client_accounts?.business_name,
          },
        },
      });
      if (error) throw error;

      // Update the onboarding step
      await supabase
        .from("client_onboarding")
        .update({ [stepKey]: new Date().toISOString() })
        .eq("id", onboarding.id);

      toast.success(`${ONBOARDING_STEPS.find(s => s.key === stepKey)?.label} completed`);
      fetchOnboardings();
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRunningSteps(prev => {
        const next = new Set(prev);
        next.delete(stepId);
        return next;
      });
    }
  };

  const markStepComplete = async (onboarding: ClientOnboarding, stepKey: string) => {
    const { error } = await supabase
      .from("client_onboarding")
      .update({ [stepKey]: new Date().toISOString() })
      .eq("id", onboarding.id);

    if (error) {
      toast.error("Failed to update step");
    } else {
      toast.success("Step marked complete");
      fetchOnboardings();
    }
  };

  const getOnboardingProgress = (onboarding: ClientOnboarding) => {
    const completed = getCompletedSteps(onboarding);
    return Math.round((completed / ONBOARDING_STEPS.length) * 100);
  };

  const getTierBadge = (tier: string) => {
    const colors: Record<string, string> = {
      foundation: "bg-slate-500",
      growth: "bg-blue-500",
      transformation: "bg-purple-500",
    };
    return <Badge className={colors[tier] || "bg-gray-500"}>{tier}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Rocket className="h-5 w-5" />
          Client Onboarding
        </CardTitle>
        <Button size="sm" variant="outline" onClick={fetchOnboardings}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : onboardings.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No clients in onboarding. Add a client to start the onboarding process.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Next Step</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {onboardings.map((onboarding) => {
                const progress = getOnboardingProgress(onboarding);
                const completedCount = getCompletedSteps(onboarding);
                const nextStep = ONBOARDING_STEPS[completedCount];

                return (
                  <TableRow key={onboarding.id}>
                    <TableCell>
                      <div className="font-medium">{onboarding.client_accounts?.business_name}</div>
                      <div className="text-xs text-muted-foreground">{onboarding.client_accounts?.email}</div>
                    </TableCell>
                    <TableCell>{getTierBadge(onboarding.client_accounts?.tier || "")}</TableCell>
                    <TableCell>
                      <div className="w-32">
                        <div className="flex justify-between text-xs mb-1">
                          <span>{completedCount}/{ONBOARDING_STEPS.length}</span>
                          <span>{progress}%</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                      </div>
                    </TableCell>
                    <TableCell>
                      {nextStep ? (
                        <div className="flex items-center gap-2">
                          <nextStep.icon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{nextStep.label}</span>
                        </div>
                      ) : (
                        <Badge className="bg-green-500">Complete</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setSelectedOnboarding(onboarding); setDetailsOpen(true); }}
                        >
                          View
                        </Button>
                        {nextStep?.automation && (
                          <Button
                            size="sm"
                            onClick={() => runOnboardingStep(onboarding, nextStep.key, nextStep.automation!)}
                            disabled={runningSteps.has(`${onboarding.id}-${nextStep.key}`)}
                          >
                            {runningSteps.has(`${onboarding.id}-${nextStep.key}`) ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                Onboarding: {selectedOnboarding?.client_accounts?.business_name}
              </DialogTitle>
            </DialogHeader>
            {selectedOnboarding && (
              <div className="space-y-4">
                <div className="grid gap-2">
                  {ONBOARDING_STEPS.map((step, index) => {
                    const isCompleted = selectedOnboarding[step.key as keyof ClientOnboarding] !== null;
                    const completedAt = selectedOnboarding[step.key as keyof ClientOnboarding] as string | null;
                    const stepId = `${selectedOnboarding.id}-${step.key}`;

                    return (
                      <div
                        key={step.key}
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          isCompleted ? "bg-green-50 border-green-200" : "bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {isCompleted ? (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          ) : (
                            <Circle className="h-5 w-5 text-muted-foreground" />
                          )}
                          <div>
                            <div className="font-medium">{step.label}</div>
                            {completedAt && (
                              <div className="text-xs text-muted-foreground">
                                {format(new Date(completedAt), "MMM d, yyyy 'at' h:mm a")}
                              </div>
                            )}
                          </div>
                        </div>
                        {!isCompleted && (
                          <div className="flex gap-1">
                            {step.automation && (
                              <Button
                                size="sm"
                                onClick={() => runOnboardingStep(selectedOnboarding, step.key, step.automation!)}
                                disabled={runningSteps.has(stepId)}
                              >
                                {runningSteps.has(stepId) ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Play className="h-4 w-4 mr-1" />
                                    Run
                                  </>
                                )}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => markStepComplete(selectedOnboarding, step.key)}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Mark Done
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}