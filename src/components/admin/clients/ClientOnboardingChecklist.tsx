import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import {
  CheckCircle2,
  Circle,
  ChevronRight,
  Calendar,
  CalendarIcon,
  FileText,
  Image,
  MessageSquare,
  ClipboardList,
  TrendingUp,
  Users,
  Loader2,
  Sparkles,
  Send,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ProjectSetupWizard } from "../misc/ProjectSetupWizard";
import type { Json } from "@/integrations/supabase/types";
import { callAdminApi } from "@/lib/admin-api";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";

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
  website_url: string | null;
  context_profile: Json | null;
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
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // Modal states
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("Kickoff Strategy Call");
  const [meetingDay, setMeetingDay] = useState<Date | undefined>(undefined);
  const [meetingTime, setMeetingTime] = useState("09:00");
  const [messageContent, setMessageContent] = useState("");

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

  // Action handlers
  const handleScheduleMeeting = async () => {
    if (!selectedClient || !meetingDay || !meetingTime) return;
    setActionLoading("kickoff");
    try {
      const [hours, minutes] = meetingTime.split(":").map((n) => Number(n));
      const scheduledAt = new Date(meetingDay);
      scheduledAt.setHours(hours || 0, minutes || 0, 0, 0);

      const resp = await supabase.functions.invoke("admin", {
        body: {
          action: "create_meeting",
          password: adminPassword,
          data: {
            client_account_id: selectedClient.id,
            title: meetingTitle,
            scheduled_at: scheduledAt.toISOString(),
            meeting_type: "kickoff",
            duration_minutes: 60,
          },
        },
      });

      if (resp.error) {
        const msg = await getEdgeErrorMessage(resp.error, resp.data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to schedule meeting");
      }
      if ((resp.data as any)?.error) throw new Error((resp.data as any).error);

      toast.success("Kickoff meeting scheduled!");
      setMeetingModalOpen(false);
      setMeetingDay(undefined);
      setMeetingTime("09:00");
      await fetchOnboardingData(selectedClient.id);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ? `Failed to schedule meeting: ${err.message}` : "Failed to schedule meeting");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRequestAssets = async () => {
    if (!selectedClient) return;
    setActionLoading("brand_assets");
    try {
      // Send a message requesting brand assets via admin edge function
      const resp = await supabase.functions.invoke("admin", {
        body: {
          action: "send_message",
          password: adminPassword,
          data: {
            client_account_id: selectedClient.id,
            sender_name: "Account Team",
            message: `Hi ${selectedClient.business_name} team! 👋\n\nTo get started on your marketing materials, we'll need the following brand assets:\n\n• Logo files (PNG and SVG preferred)\n• Brand colors (hex codes)\n• Brand fonts\n• Any existing marketing materials\n• Product/service photos\n\nPlease upload these to your Brand Assets tab in the client portal, or reply to this message with any questions!\n\nBest,\nYour Marketing Team`,
          },
        },
      });
      if (resp.error) {
        const msg = await getEdgeErrorMessage(resp.error, resp.data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to send request");
      }
      if ((resp.data as any)?.error) throw new Error((resp.data as any).error);
      toast.success("Brand assets request sent!");
      await fetchOnboardingData(selectedClient.id);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ? `Failed to send request: ${err.message}` : "Failed to send request");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendWelcome = async () => {
    if (!selectedClient || !messageContent.trim()) return;
    setActionLoading("welcome_message");
    try {
      const resp = await supabase.functions.invoke("admin", {
        body: {
          action: "send_message",
          password: adminPassword,
          data: {
            client_account_id: selectedClient.id,
            sender_name: "Account Team",
            message: messageContent,
          },
        },
      });
      if (resp.error) {
        const msg = await getEdgeErrorMessage(resp.error, resp.data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to send message");
      }
      if ((resp.data as any)?.error) throw new Error((resp.data as any).error);
      toast.success("Welcome message sent!");
      setMessageModalOpen(false);
      setMessageContent("");
      await fetchOnboardingData(selectedClient.id);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ? `Failed to send message: ${err.message}` : "Failed to send message");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendIntakeForm = async () => {
    if (!selectedClient) return;
    setActionLoading("intake_form");
    try {
      // Send intake form request via message
      const resp = await supabase.functions.invoke("admin", {
        body: {
          action: "send_message",
          password: adminPassword,
          data: {
            client_account_id: selectedClient.id,
            sender_name: "Account Team",
            message: `Hi ${selectedClient.business_name} team!\n\nTo better understand your business and marketing goals, please complete our intake questionnaire.\n\nThis helps us:\n• Understand your target audience\n• Identify your main competitors\n• Learn about your current marketing efforts\n• Set clear goals for our partnership\n\nPlease visit the Gap Analysis page to complete the form, or let us know if you have any questions!\n\nBest,\nYour Marketing Team`,
          },
        },
      });
      if (resp.error) {
        const msg = await getEdgeErrorMessage(resp.error, resp.data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to send intake form");
      }
      if ((resp.data as any)?.error) throw new Error((resp.data as any).error);

      const updateResp = await supabase.functions.invoke("admin", {
        body: {
          action: "update",
          password: adminPassword,
          table: "client_onboarding",
          id: selectedClient.id,
          data: { intake_form_sent_at: new Date().toISOString() },
        },
      });
      if (updateResp.error) {
        const msg = await getEdgeErrorMessage(updateResp.error, updateResp.data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to send intake form");
      }

      toast.success("Intake form request sent!");
      await fetchOnboardingData(selectedClient.id);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ? `Failed to send intake form: ${err.message}` : "Failed to send intake form");
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfigureDashboard = async () => {
    if (!selectedClient) return;
    setActionLoading("analytics_setup");
    try {
      const resp = await supabase.functions.invoke("admin", {
        body: {
          action: "update",
          password: adminPassword,
          table: "client_onboarding",
          id: selectedClient.id,
          data: { dashboard_created_at: new Date().toISOString() },
        },
      });
      if (resp.error) {
        const msg = await getEdgeErrorMessage(resp.error, resp.data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to configure dashboard");
      }
      if ((resp.data as any)?.error) throw new Error((resp.data as any).error);

      toast.success("Dashboard configured!");
      await fetchOnboardingData(selectedClient.id);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ? `Failed to configure dashboard: ${err.message}` : "Failed to configure dashboard");
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddDeliverable = async () => {
    if (!selectedClient) return;
    setActionLoading("first_deliverable");
    try {
      const response = await supabase.functions.invoke("admin", {
        body: {
          action: "create_deliverable",
          password: adminPassword,
          data: {
            client_account_id: selectedClient.id,
            title: `${selectedClient.tier === "foundation" ? "Local SEO" : "Marketing"} Audit Report`,
            description: "Initial audit report with findings and recommendations",
            category: "report",
          },
        },
      });
      if (response.error) {
        const msg = await getEdgeErrorMessage(response.error, response.data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to add deliverable");
      }
      const result = response.data;
      if (result?.error) throw new Error(result.error);
      toast.success("Deliverable added!");
      await fetchOnboardingData(selectedClient.id);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to add deliverable");
    } finally {
      setActionLoading(null);
    }
  };

  const handleScanWebsite = async () => {
    if (!selectedClient) return;
    if (!selectedClient.website_url) {
      toast.error("No website URL on file for this client. Add one in Client Management first.");
      return;
    }
    setActionLoading("business_context");
    try {
      const { data, error } = await supabase.functions.invoke("analyze-website", {
        body: { url: selectedClient.website_url },
      });
      if (error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Website scan failed");
      }
      const contextProfile = data?.analysis?.context_profile;
      if (!contextProfile) throw new Error("No context profile returned from scan");

      const { error: updateError } = await callAdminApi(adminPassword, {
        action: "update",
        table: "client_accounts",
        id: selectedClient.id,
        data: { context_profile: { ...(contextProfile as Record<string, unknown>), source: "website_scan", partial: false } },
      });
      if (updateError) throw new Error(updateError);

      toast.success("Context profile built from website scan. Content generation will now use this data.");
      await fetchNewClients();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ? `Scan failed: ${err.message}` : "Website scan failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleStepAction = (stepId: string) => {
    switch (stepId) {
      case "business_context":
        handleScanWebsite();
        break;
      case "kickoff":
        setMeetingModalOpen(true);
        break;
      case "brand_assets":
        handleRequestAssets();
        break;
      case "welcome_message":
        setMessageContent(`Hi ${selectedClient?.business_name} team! 👋\n\nWelcome aboard! We're thrilled to have you as a partner.\n\nOver the next 30 days, here's what you can expect:\n• Week 1: Discovery and asset collection\n• Week 2: Strategy development\n• Week 3: Initial implementation\n• Week 4: First results review\n\nYou can access your client portal anytime to:\n• View project progress\n• Send us messages\n• Review and approve content\n• Access reports and analytics\n\nDon't hesitate to reach out if you have any questions!\n\nBest,\nYour Marketing Team`);
        setMessageModalOpen(true);
        break;
      case "project_setup":
        setProjectModalOpen(true);
        break;
      case "intake_form":
        handleSendIntakeForm();
        break;
      case "analytics_setup":
        handleConfigureDashboard();
        break;
      case "first_deliverable":
        handleAddDeliverable();
        break;
    }
  };

  const getOnboardingSteps = (): OnboardingStep[] => {
    if (!selectedClient) return [];

    const onboarding = onboardingData.onboarding;
    
    return [
      {
        id: "business_context",
        title: "Build Business Context Profile",
        description: selectedClient.context_profile
          ? "Context profile populated — AI content will be tailored to this client."
          : selectedClient.website_url
          ? "Scan the client's website to extract services, tone, audience, and differentiators for AI content."
          : "No website URL on file. Add one in Client Management, then scan to build the context profile.",
        icon: <Globe className="h-5 w-5" />,
        isComplete: !!selectedClient.context_profile,
        actionLabel: selectedClient.website_url ? (selectedClient.context_profile ? "Re-scan" : "Scan Website") : undefined,
        priority: "high" as const,
      },
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
      case "transformation":
        return [
          "Full marketing funnel audit",
          "Paid ads campaign setup",
          "Advanced analytics and attribution",
          "Conversion rate optimization plan",
          "Multi-channel campaign orchestration",
          "Custom reporting dashboard",
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
                        {(step.actionLabel && (!step.isComplete || step.id === "project_setup" || step.id === "business_context")) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-shrink-0"
                            disabled={actionLoading === step.id}
                            onClick={() => handleStepAction(step.id)}
                          >
                            {actionLoading === step.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              step.actionLabel
                            )}
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

      {/* Schedule Meeting Modal */}
      <Dialog open={meetingModalOpen} onOpenChange={setMeetingModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Kickoff Meeting</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="meetingTitle">Meeting Title</Label>
              <Input
                id="meetingTitle"
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !meetingDay && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {meetingDay ? format(meetingDay, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker
                      mode="single"
                      selected={meetingDay}
                      onSelect={setMeetingDay}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="meetingTime">Time</Label>
                <Input
                  id="meetingTime"
                  type="time"
                  value={meetingTime}
                  onChange={(e) => setMeetingTime(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMeetingModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleScheduleMeeting}
              disabled={!meetingDay || !meetingTime || actionLoading === "kickoff"}
            >
              {actionLoading === "kickoff" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Calendar className="h-4 w-4 mr-2" />
              )}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Message Modal */}
      <Dialog open={messageModalOpen} onOpenChange={setMessageModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send Welcome Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="messageContent">Message</Label>
              <Textarea
                id="messageContent"
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                rows={10}
                placeholder="Enter your welcome message..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMessageModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSendWelcome} 
              disabled={!messageContent.trim() || actionLoading === "welcome_message"}
            >
              {actionLoading === "welcome_message" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Project Setup Wizard */}
      {selectedClient && (
        <ProjectSetupWizard
          open={projectModalOpen}
          onClose={() => setProjectModalOpen(false)}
          client={{
            id: selectedClient.id,
            business_name: selectedClient.business_name,
            tier: selectedClient.tier,
          }}
          adminPassword={adminPassword}
          onSuccess={() => fetchOnboardingData(selectedClient.id)}
        />
      )}
    </Card>
  );
}
