import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Send,
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
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // Modal states
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("Kickoff Strategy Call");
  const [meetingDate, setMeetingDate] = useState("");
  const [messageContent, setMessageContent] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");

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
    if (!selectedClient || !meetingDate) return;
    setActionLoading("kickoff");
    try {
      const { error } = await supabase.from("client_meetings").insert({
        client_account_id: selectedClient.id,
        title: meetingTitle,
        scheduled_at: new Date(meetingDate).toISOString(),
        meeting_type: "kickoff",
        status: "scheduled",
        duration_minutes: 60,
      });
      if (error) throw error;
      
      // Update onboarding record
      await supabase.from("client_onboarding")
        .update({ kickoff_scheduled_at: new Date().toISOString() })
        .eq("client_account_id", selectedClient.id);
      
      toast.success("Kickoff meeting scheduled!");
      setMeetingModalOpen(false);
      setMeetingDate("");
      await fetchOnboardingData(selectedClient.id);
    } catch (err) {
      console.error(err);
      toast.error("Failed to schedule meeting");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRequestAssets = async () => {
    if (!selectedClient) return;
    setActionLoading("brand_assets");
    try {
      // Send a message requesting brand assets
      const { error } = await supabase.from("client_messages").insert({
        client_account_id: selectedClient.id,
        sender_type: "admin",
        sender_name: "Account Team",
        message: `Hi ${selectedClient.business_name} team! 👋\n\nTo get started on your marketing materials, we'll need the following brand assets:\n\n• Logo files (PNG and SVG preferred)\n• Brand colors (hex codes)\n• Brand fonts\n• Any existing marketing materials\n• Product/service photos\n\nPlease upload these to your Brand Assets tab in the client portal, or reply to this message with any questions!\n\nBest,\nYour Marketing Team`,
      });
      if (error) throw error;
      toast.success("Brand assets request sent!");
      await fetchOnboardingData(selectedClient.id);
    } catch (err) {
      console.error(err);
      toast.error("Failed to send request");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendWelcome = async () => {
    if (!selectedClient || !messageContent.trim()) return;
    setActionLoading("welcome_message");
    try {
      const { error } = await supabase.from("client_messages").insert({
        client_account_id: selectedClient.id,
        sender_type: "admin",
        sender_name: "Account Team",
        message: messageContent,
      });
      if (error) throw error;
      toast.success("Welcome message sent!");
      setMessageModalOpen(false);
      setMessageContent("");
      await fetchOnboardingData(selectedClient.id);
    } catch (err) {
      console.error(err);
      toast.error("Failed to send message");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateProject = async () => {
    if (!selectedClient || !projectName.trim()) return;
    setActionLoading("project_setup");
    try {
      const { error } = await supabase.from("client_projects").insert({
        client_account_id: selectedClient.id,
        name: projectName,
        description: projectDescription,
        status: "in_progress",
        progress_percentage: 0,
        start_date: new Date().toISOString().split("T")[0],
      });
      if (error) throw error;
      toast.success("Project created!");
      setProjectModalOpen(false);
      setProjectName("");
      setProjectDescription("");
      await fetchOnboardingData(selectedClient.id);
    } catch (err) {
      console.error(err);
      toast.error("Failed to create project");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendIntakeForm = async () => {
    if (!selectedClient) return;
    setActionLoading("intake_form");
    try {
      // Send intake form request via message
      const { error } = await supabase.from("client_messages").insert({
        client_account_id: selectedClient.id,
        sender_type: "admin",
        sender_name: "Account Team",
        message: `Hi ${selectedClient.business_name} team!\n\nTo better understand your business and marketing goals, please complete our intake questionnaire.\n\nThis helps us:\n• Understand your target audience\n• Identify your main competitors\n• Learn about your current marketing efforts\n• Set clear goals for our partnership\n\nPlease visit the Gap Analysis page to complete the form, or let us know if you have any questions!\n\nBest,\nYour Marketing Team`,
      });
      if (error) throw error;
      
      await supabase.from("client_onboarding")
        .update({ intake_form_sent_at: new Date().toISOString() })
        .eq("client_account_id", selectedClient.id);
      
      toast.success("Intake form request sent!");
      await fetchOnboardingData(selectedClient.id);
    } catch (err) {
      console.error(err);
      toast.error("Failed to send intake form");
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfigureDashboard = async () => {
    if (!selectedClient) return;
    setActionLoading("analytics_setup");
    try {
      await supabase.from("client_onboarding")
        .update({ dashboard_created_at: new Date().toISOString() })
        .eq("client_account_id", selectedClient.id);
      
      toast.success("Dashboard configured!");
      await fetchOnboardingData(selectedClient.id);
    } catch (err) {
      console.error(err);
      toast.error("Failed to configure dashboard");
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddDeliverable = async () => {
    if (!selectedClient) return;
    setActionLoading("first_deliverable");
    try {
      const { error } = await supabase.from("deliverables").insert({
        client_account_id: selectedClient.id,
        title: `${selectedClient.tier === "foundation" ? "Local SEO" : "Marketing"} Audit Report`,
        description: "Initial audit report with findings and recommendations",
        category: "report",
        status: "pending_review",
      });
      if (error) throw error;
      toast.success("Deliverable added!");
      await fetchOnboardingData(selectedClient.id);
    } catch (err) {
      console.error(err);
      toast.error("Failed to add deliverable");
    } finally {
      setActionLoading(null);
    }
  };

  const handleStepAction = (stepId: string) => {
    switch (stepId) {
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
        setProjectName(selectedClient?.tier === "foundation" ? "Local SEO Setup" : "Marketing Campaign Launch");
        setProjectDescription(`Initial ${selectedClient?.tier} tier project for ${selectedClient?.business_name}`);
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
            <div className="space-y-2">
              <Label htmlFor="meetingDate">Date & Time</Label>
              <Input
                id="meetingDate"
                type="datetime-local"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="block w-full [color-scheme:dark] dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMeetingModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleScheduleMeeting} 
              disabled={!meetingDate || actionLoading === "kickoff"}
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

      {/* Create Project Modal */}
      <Dialog open={projectModalOpen} onOpenChange={setProjectModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create First Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="projectName">Project Name</Label>
              <Input
                id="projectName"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g., Local SEO Setup"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="projectDescription">Description</Label>
              <Textarea
                id="projectDescription"
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                rows={3}
                placeholder="Project description..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateProject} 
              disabled={!projectName.trim() || actionLoading === "project_setup"}
            >
              {actionLoading === "project_setup" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ClipboardList className="h-4 w-4 mr-2" />
              )}
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
