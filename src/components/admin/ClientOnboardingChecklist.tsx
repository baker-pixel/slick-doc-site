import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  Circle,
  ChevronRight,
  Calendar,
  FileText,
  Image,
  MessageSquare,
  ClipboardList,
  TrendingUp,
  Users,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  isComplete: boolean;
  action?: () => void;
  actionLabel?: string;
  priority: "high" | "medium" | "low";
}

interface ClientAccount {
  id: string;
  business_name: string;
  email: string;
  tier: string;
  status: string;
  created_at: string;
  kickoff_scheduled_at: string | null;
  intake_completed_at: string | null;
  onboarded_at: string | null;
}

interface ClientOnboardingChecklistProps {
  adminPassword: string;
}

export function ClientOnboardingChecklist({ adminPassword }: ClientOnboardingChecklistProps) {
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientAccount | null>(null);
  const [onboardingData, setOnboardingData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [loadingSteps, setLoadingSteps] = useState(false);

  useEffect(() => {
    fetchNewClients();
  }, []);

  const fetchNewClients = async () => {
    setLoading(true);
    try {
      // Get clients created in the last 30 days that haven't been fully onboarded
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from("client_accounts")
        .select("*")
        .gte("created_at", thirtyDaysAgo.toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;
      setClients(data || []);
      
      // Auto-select the newest client
      if (data && data.length > 0) {
        setSelectedClient(data[0]);
        await fetchOnboardingData(data[0].id);
      }
    } catch (err) {
      console.error("Error fetching clients:", err);
      toast.error("Failed to load clients");
    } finally {
      setLoading(false);
    }
  };

  const fetchOnboardingData = async (clientId: string) => {
    setLoadingSteps(true);
    try {
      const [
        meetingsRes,
        projectsRes,
        brandAssetsRes,
        messagesRes,
        deliverablesRes,
        tasksRes,
        onboardingRes,
      ] = await Promise.all([
        supabase.from("client_meetings").select("id").eq("client_account_id", clientId),
        supabase.from("client_projects").select("id").eq("client_account_id", clientId),
        supabase.from("brand_assets").select("id").eq("client_account_id", clientId),
        supabase.from("client_messages").select("id").eq("client_account_id", clientId),
        supabase.from("deliverables").select("id").eq("client_account_id", clientId),
        supabase.from("client_tasks").select("id, status").eq("client_account_id", clientId),
        supabase.from("client_onboarding").select("*").eq("client_account_id", clientId).maybeSingle(),
      ]);

      setOnboardingData({
        meetings: meetingsRes.data?.length || 0,
        projects: projectsRes.data?.length || 0,
        brandAssets: brandAssetsRes.data?.length || 0,
        messages: messagesRes.data?.length || 0,
        deliverables: deliverablesRes.data?.length || 0,
        tasks: tasksRes.data?.length || 0,
        completedTasks: tasksRes.data?.filter((t) => t.status === "completed").length || 0,
        onboarding: onboardingRes.data,
      });
    } catch (err) {
      console.error("Error fetching onboarding data:", err);
    } finally {
      setLoadingSteps(false);
    }
  };

  const handleClientSelect = async (client: ClientAccount) => {
    setSelectedClient(client);
    await fetchOnboardingData(client.id);
  };

  const getOnboardingSteps = (): OnboardingStep[] => {
    if (!selectedClient) return [];

    const onboarding = onboardingData.onboarding;
    
    return [
      {
        id: "kickoff",
        title: "Schedule Kickoff Call",
        description: "Book an initial strategy session to understand their goals and set expectations.",
        icon: <Calendar className="h-5 w-5" />,
        isComplete: !!onboarding?.kickoff_scheduled_at || onboardingData.meetings > 0,
        actionLabel: "Schedule Meeting",
        priority: "high",
      },
      {
        id: "brand_assets",
        title: "Collect Brand Assets",
        description: "Request logo, brand colors, fonts, and any existing marketing materials.",
        icon: <Image className="h-5 w-5" />,
        isComplete: onboardingData.brandAssets > 0,
        actionLabel: "Request Assets",
        priority: "high",
      },
      {
        id: "welcome_message",
        title: "Send Welcome Message",
        description: "Introduce yourself and the team, explain what to expect in the first 30 days.",
        icon: <MessageSquare className="h-5 w-5" />,
        isComplete: onboardingData.messages > 0,
        actionLabel: "Send Message",
        priority: "high",
      },
      {
        id: "project_setup",
        title: "Create First Project",
        description: `Set up the initial ${selectedClient.tier === "foundation" ? "local SEO" : "marketing"} project with milestones.`,
        icon: <ClipboardList className="h-5 w-5" />,
        isComplete: onboardingData.projects > 0,
        actionLabel: "Create Project",
        priority: "medium",
      },
      {
        id: "intake_form",
        title: "Complete Intake Questionnaire",
        description: "Gather detailed information about their business, competitors, and target audience.",
        icon: <FileText className="h-5 w-5" />,
        isComplete: !!onboarding?.intake_form_completed_at || !!selectedClient.intake_completed_at,
        actionLabel: "Send Intake Form",
        priority: "medium",
      },
      {
        id: "analytics_setup",
        title: "Set Up Analytics Dashboard",
        description: "Configure their KPI dashboard and connect analytics sources.",
        icon: <TrendingUp className="h-5 w-5" />,
        isComplete: !!onboarding?.dashboard_created_at,
        actionLabel: "Configure Dashboard",
        priority: "medium",
      },
      {
        id: "first_deliverable",
        title: "Deliver First Asset",
        description: "Send the first deliverable (audit report, content piece, or design) for review.",
        icon: <Sparkles className="h-5 w-5" />,
        isComplete: onboardingData.deliverables > 0,
        actionLabel: "Add Deliverable",
        priority: "low",
      },
    ];
  };

  const steps = getOnboardingSteps();
  const completedSteps = steps.filter((s) => s.isComplete).length;
  const progressPercent = steps.length > 0 ? (completedSteps / steps.length) * 100 : 0;

  const getTierRecommendations = (tier: string): string[] => {
    switch (tier) {
      case "foundation":
        return [
          "Focus on Google Business Profile optimization first",
          "Set up review generation system",
          "Create local citations strategy",
          "Basic website audit and quick wins",
        ];
      case "growth":
        return [
          "Comprehensive SEO audit and roadmap",
          "Content calendar setup (4 blogs/month)",
          "Email nurture sequence configuration",
          "Social media content planning",
        ];
      case "scale":
        return [
          "Full marketing funnel audit",
          "Paid ads campaign setup",
          "Advanced analytics and attribution",
          "Conversion rate optimization plan",
        ];
      case "dominate":
        return [
          "Complete market domination strategy",
          "Multi-channel campaign orchestration",
          "Custom reporting dashboard",
          "Weekly strategy calls scheduled",
        ];
      default:
        return [];
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          New Client Onboarding
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Client Selector */}
        {clients.length > 0 ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {clients.map((client) => (
                <Button
                  key={client.id}
                  variant={selectedClient?.id === client.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleClientSelect(client)}
                >
                  {client.business_name}
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {client.tier}
                  </Badge>
                </Button>
              ))}
            </div>

            {selectedClient && (
              <>
                {/* Progress Overview */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Onboarding Progress</span>
                    <span className="text-muted-foreground">
                      {completedSteps} of {steps.length} steps complete
                    </span>
                  </div>
                  <Progress value={progressPercent} className="h-2" />
                </div>

                {/* Tier-Specific Recommendations */}
                <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                  <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Recommended for {selectedClient.tier.charAt(0).toUpperCase() + selectedClient.tier.slice(1)} Tier
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {getTierRecommendations(selectedClient.tier).map((rec, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <ChevronRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Onboarding Steps */}
                {loadingSteps ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm">Next Steps</h4>
                    {steps.map((step) => (
                      <div
                        key={step.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                          step.isComplete
                            ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
                            : step.priority === "high"
                            ? "bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800"
                            : "bg-muted/50 border-border"
                        }`}
                      >
                        <div className="mt-0.5">
                          {step.isComplete ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                          ) : (
                            <Circle className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {step.icon}
                            <span className={`font-medium ${step.isComplete ? "line-through text-muted-foreground" : ""}`}>
                              {step.title}
                            </span>
                            {step.priority === "high" && !step.isComplete && (
                              <Badge variant="destructive" className="text-xs">
                                Priority
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
                        </div>
                        {!step.isComplete && step.actionLabel && (
                          <Button size="sm" variant="outline" className="flex-shrink-0">
                            {step.actionLabel}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Quick Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{onboardingData.projects}</p>
                    <p className="text-xs text-muted-foreground">Projects</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{onboardingData.tasks}</p>
                    <p className="text-xs text-muted-foreground">Tasks</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{onboardingData.deliverables}</p>
                    <p className="text-xs text-muted-foreground">Deliverables</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{onboardingData.messages}</p>
                    <p className="text-xs text-muted-foreground">Messages</p>
                  </div>
                </div>

                {/* Client Info */}
                <div className="text-xs text-muted-foreground pt-2 border-t">
                  Created {format(new Date(selectedClient.created_at), "MMM d, yyyy")} • {selectedClient.email}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No new clients in the last 30 days.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
