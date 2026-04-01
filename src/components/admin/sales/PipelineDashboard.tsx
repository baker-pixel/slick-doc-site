import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { 
  Loader2, Users, Mail, MousePointerClick, Calendar, TrendingUp, 
  UserPlus, Eye, ChevronDown, ChevronUp, FileText, Building2 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PipelineStage {
  id: string;
  name: string;
  description: string;
  stage_order: number;
  color: string;
  count: number;
}

interface PipelineMetrics {
  totalLeads: number;
  emailsSent: number;
  emailsOpened: number;
  emailsClicked: number;
  pendingEmails: number;
  scheduledContent: number;
}

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  business_name: string;
  email: string;
  status: string;
  created_at: string;
  source: "gap_analysis" | "contact" | "pdf";
  has_client_account?: boolean;
  ai_analysis?: any;
}

interface PipelineDashboardProps {
  adminPassword: string;
}

export default function PipelineDashboard({ adminPassword }: PipelineDashboardProps) {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [metrics, setMetrics] = useState<PipelineMetrics>({
    totalLeads: 0,
    emailsSent: 0,
    emailsOpened: 0,
    emailsClicked: 0,
    pendingEmails: 0,
    scheduledContent: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [showLeads, setShowLeads] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [selectedTier, setSelectedTier] = useState("foundation");
  const { toast } = useToast();

  useEffect(() => {
    fetchPipelineData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminPassword]);

  const fetchPipelineData = async () => {
    if (!adminPassword) {
      setStages([]);
      setLeads([]);
      setIsLoading(false);
      return;
    }

    try {
      // Use admin function to bypass RLS for internal admin dashboards
      const [stagesRes, contactsRes, gapRes, clientsRes] = await Promise.all([
        supabase.functions.invoke("admin", {
          body: { action: "list", table: "pipeline_stages", password: adminPassword },
        }),
        supabase.functions.invoke("admin", {
          body: { action: "list", table: "contact_submissions", password: adminPassword },
        }),
        supabase.functions.invoke("admin", {
          body: { action: "list", table: "gap_analysis_submissions", password: adminPassword },
        }),
        supabase.functions.invoke("admin", {
          body: { action: "list", table: "client_accounts", password: adminPassword },
        }),
      ]);

      if (stagesRes.error) throw stagesRes.error;
      if (contactsRes.error) throw contactsRes.error;
      if (gapRes.error) throw gapRes.error;
      if (clientsRes.error) throw clientsRes.error;

      const stagesData = ((stagesRes.data as any)?.data || []) as Array<Omit<PipelineStage, "count">>;
      const contacts = ((contactsRes.data as any)?.data || []) as Array<any>;
      const gapAnalyses = ((gapRes.data as any)?.data || []) as Array<any>;
      const clients = ((clientsRes.data as any)?.data || []) as Array<any>;

      // Create a map of client accounts by email+business_name for lookup
      const clientAccountsMap = new Map<string, any>();
      clients.forEach((c: any) => {
        const key = `${c.email?.toLowerCase()}_${c.business_name?.toLowerCase()}`;
        clientAccountsMap.set(key, c);
      });

      // Build unified leads list
      const allLeads: Lead[] = [];

      // Add gap analysis submissions (these are the primary leads we care about)
      gapAnalyses.forEach((gap: any) => {
        const lookupKey = `${gap.email?.toLowerCase()}_${gap.business_name?.toLowerCase()}`;
        allLeads.push({
          id: gap.id,
          first_name: gap.first_name || "",
          last_name: gap.last_name || "",
          business_name: gap.business_name || "",
          email: gap.email || "",
          status: gap.status || "submitted",
          created_at: gap.created_at,
          source: "gap_analysis",
          has_client_account: clientAccountsMap.has(lookupKey),
          ai_analysis: gap.ai_analysis,
        });
      });

      // Add contact submissions that don't have a matching gap analysis
      const gapEmails = new Set(gapAnalyses.map((g: any) => g.email?.toLowerCase()));
      contacts.forEach((contact: any) => {
        if (!gapEmails.has(contact.email?.toLowerCase())) {
          const lookupKey = `${contact.email?.toLowerCase()}_${contact.business_name?.toLowerCase()}`;
          allLeads.push({
            id: contact.id,
            first_name: contact.first_name || "",
            last_name: contact.last_name || "",
            business_name: contact.business_name || "",
            email: contact.email || "",
            status: contact.status || "new",
            created_at: contact.created_at,
            source: "contact",
            has_client_account: clientAccountsMap.has(lookupKey),
          });
        }
      });

      // Sort by created_at desc
      allLeads.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setLeads(allLeads);

      const activeStages = stagesData
        .filter((s: any) => s.is_active !== false)
        .sort((a: any, b: any) => (a.stage_order ?? 0) - (b.stage_order ?? 0));

      // Count contacts per stage
      const stageCounts: Record<string, number> = {};
      contacts.forEach((c: any) => {
        const stageId = c.pipeline_stage_id || "unassigned";
        stageCounts[stageId] = (stageCounts[stageId] || 0) + 1;
      });

      const stagesWithCounts = activeStages.map((stage: any) => ({
        ...stage,
        count: stageCounts[stage.id] || 0,
      })) as PipelineStage[];

      setStages(stagesWithCounts);

      // Fetch metrics
      const [emailLogs, trackingEvents, emailQueue, contentCalendar, pdfLeads] =
        await Promise.all([
          supabase.from("email_logs").select("id", { count: "exact" }),
          supabase.from("email_tracking_events").select("event_type"),
          supabase.from("email_queue").select("id", { count: "exact" }).eq("status", "pending"),
          supabase.from("content_calendar").select("id", { count: "exact" }).eq("status", "scheduled"),
          supabase.from("pdf_leads").select("id", { count: "exact" }),
        ]);

      const opens = trackingEvents.data?.filter((e) => e.event_type === "open").length || 0;
      const clicks = trackingEvents.data?.filter((e) => e.event_type === "click").length || 0;

      setMetrics({
        totalLeads: allLeads.length + (pdfLeads.count || 0),
        emailsSent: emailLogs.count || 0,
        emailsOpened: opens,
        emailsClicked: clicks,
        pendingEmails: emailQueue.count || 0,
        scheduledContent: contentCalendar.count || 0,
      });
    } catch (error) {
      console.error("Error fetching pipeline data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateClientAndInvite = async () => {
    if (!selectedLead) return;

    setIsCreatingClient(true);
    try {
      // 1. Create client account
      const { data: createRes, error: createErr } = await supabase.functions.invoke("admin", {
        body: {
          action: "create_client_account",
          password: adminPassword,
          data: {
            email: selectedLead.email,
            business_name: selectedLead.business_name,
            first_name: selectedLead.first_name,
            last_name: selectedLead.last_name,
            tier: selectedTier,
          },
        },
      });

      if (createErr) throw createErr;
      if ((createRes as any)?.error) throw new Error((createRes as any).error);

      const clientAccountId = (createRes as any)?.data?.id;
      if (!clientAccountId) throw new Error("Failed to create client account");

      // 2. Create invitation
      const { data: inviteRes, error: inviteErr } = await supabase.functions.invoke("admin", {
        body: {
          action: "create_invitation",
          password: adminPassword,
          data: {
            client_account_id: clientAccountId,
            email: selectedLead.email,
            first_name: selectedLead.first_name,
            last_name: selectedLead.last_name,
          },
        },
      });

      if (inviteErr) throw inviteErr;
      if ((inviteRes as any)?.error) throw new Error((inviteRes as any).error);

      const inviteToken = (inviteRes as any)?.data?.token;

      // 3. Send invitation email
      const { error: sendErr } = await supabase.functions.invoke("send-client-invite", {
        body: {
          email: selectedLead.email,
          firstName: selectedLead.first_name,
          businessName: selectedLead.business_name,
          inviteToken,
        },
      });

      if (sendErr) throw sendErr;

      toast({
        title: "Client created & invite sent!",
        description: `Invitation sent to ${selectedLead.email}`,
      });

      setIsInviteModalOpen(false);
      setSelectedLead(null);
      fetchPipelineData();
    } catch (error: any) {
      console.error("Error creating client:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create client and send invite",
        variant: "destructive",
      });
    } finally {
      setIsCreatingClient(false);
    }
  };

  const getSourceBadge = (source: Lead["source"]) => {
    switch (source) {
      case "gap_analysis":
        return <Badge variant="default" className="bg-purple-500">Gap Analysis</Badge>;
      case "contact":
        return <Badge variant="secondary">Contact Form</Badge>;
      case "pdf":
        return <Badge variant="outline">PDF Download</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      submitted: "bg-blue-100 text-blue-800",
      new: "bg-gray-100 text-gray-800",
      contacted: "bg-yellow-100 text-yellow-800",
      qualified: "bg-green-100 text-green-800",
      converted: "bg-purple-100 text-purple-800",
    };
    return (
      <Badge variant="outline" className={colors[status] || "bg-gray-100"}>
        {status}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const openRate = metrics.emailsSent > 0 ? ((metrics.emailsOpened / metrics.emailsSent) * 100).toFixed(1) : "0";
  const clickRate = metrics.emailsOpened > 0 ? ((metrics.emailsClicked / metrics.emailsOpened) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      {/* Funnel Visualization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Lead Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between gap-2">
            {stages.map((stage, index) => {
              const maxCount = Math.max(...stages.map((s) => s.count), 1);
              const height = Math.max((stage.count / maxCount) * 150, 40);
              const width = 100 - index * 10;

              return (
                <div
                  key={stage.id}
                  className="flex flex-col items-center flex-1"
                >
                  <div
                    className="w-full rounded-t-lg flex items-center justify-center transition-all hover:opacity-80 cursor-default"
                    style={{
                      backgroundColor: stage.color,
                      height: `${height}px`,
                      width: `${width}%`,
                      marginLeft: "auto",
                      marginRight: "auto",
                    }}
                  >
                    <span className="text-white font-bold text-lg">
                      {stage.count}
                    </span>
                  </div>
                  <div className="mt-2 text-center">
                    <p className="font-medium text-sm">{stage.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {stage.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Leads</span>
            </div>
            <p className="text-2xl font-bold mt-1">{metrics.totalLeads}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Emails Sent</span>
            </div>
            <p className="text-2xl font-bold mt-1">{metrics.emailsSent}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Open Rate</span>
            </div>
            <p className="text-2xl font-bold mt-1">{openRate}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <MousePointerClick className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Click Rate</span>
            </div>
            <p className="text-2xl font-bold mt-1">{clickRate}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-muted-foreground">Pending</span>
            </div>
            <p className="text-2xl font-bold mt-1">{metrics.pendingEmails}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-purple-500" />
              <span className="text-sm text-muted-foreground">Scheduled</span>
            </div>
            <p className="text-2xl font-bold mt-1">{metrics.scheduledContent}</p>
          </CardContent>
        </Card>
      </div>

      {/* Leads List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Recent Leads ({leads.length})
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowLeads(!showLeads)}
            >
              {showLeads ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        {showLeads && (
          <CardContent>
            <div className="space-y-3">
              {leads.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No leads yet</p>
              ) : (
                leads.map((lead) => (
                  <div
                    key={lead.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        {lead.source === "gap_analysis" ? (
                          <FileText className="h-5 w-5 text-primary" />
                        ) : (
                          <Building2 className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">
                          {lead.business_name || `${lead.first_name} ${lead.last_name}`.trim() || "Unknown"}
                        </p>
                        <p className="text-sm text-muted-foreground">{lead.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {getSourceBadge(lead.source)}
                      {getStatusBadge(lead.status)}
                      {lead.has_client_account ? (
                        <Badge variant="default" className="bg-green-500">
                          <Eye className="h-3 w-3 mr-1" />
                          Client
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedLead(lead);
                            setIsInviteModalOpen(true);
                          }}
                        >
                          <UserPlus className="h-4 w-4 mr-1" />
                          Create Client
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Automation Status */}
      <Card>
        <CardHeader>
          <CardTitle>Automation Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">Email Queue Processing</p>
                <p className="text-sm text-muted-foreground">Runs every minute</p>
              </div>
              <Badge variant="default" className="bg-green-500">Active</Badge>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">Content Publisher</p>
                <p className="text-sm text-muted-foreground">Runs every minute</p>
              </div>
              <Badge variant="default" className="bg-green-500">Active</Badge>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">Form → Sequence Triggers</p>
                <p className="text-sm text-muted-foreground">Auto-enrolls new leads</p>
              </div>
              <Badge variant="default" className="bg-green-500">Active</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create Client & Send Invite Modal */}
      <Dialog open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Client & Send Portal Invite</DialogTitle>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="font-medium">{selectedLead.business_name}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedLead.first_name} {selectedLead.last_name}
                </p>
                <p className="text-sm text-muted-foreground">{selectedLead.email}</p>
              </div>

              <div className="space-y-2">
                <Label>Service Tier</Label>
                <Select value={selectedTier} onValueChange={setSelectedTier}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="foundation">Foundation</SelectItem>
                    <SelectItem value="growth">Growth</SelectItem>
                    <SelectItem value="transformation">Transformation</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <p className="text-sm text-muted-foreground">
                This will create a client account and send an email invitation to access the client portal.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsInviteModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateClientAndInvite} disabled={isCreatingClient}>
              {isCreatingClient ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Create & Send Invite
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}