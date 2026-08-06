import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  TrendingUp,
  FileText,
  MessageSquare,
  Calendar,
  ArrowRight,
  Activity,
  ChevronDown,
  Building2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DashboardStats {
  totalClients: number;
  activeClients: number;
  onboardingClients: number;
  stillOnboarding: number;
  pendingDeliverables: number;
  unreadMessages: number;
  upcomingMeetings: number;
  recentActivity: Array<{
    id: string;
    title: string;
    description: string;
    created_at: string;
    icon: string;
  }>;
  clientsNeedingAttention: Array<{
    id: string;
    business_name: string;
    tier: string;
    currentStep: number;
    totalSteps: number;
  }>;
}

interface AdminHomeDashboardProps {
  adminPassword: string;
  onSelectClient: (clientId: string, businessName: string) => void;
  onNavigateToSection: (section: string) => void;
}

export function AdminHomeDashboard({ 
  adminPassword, 
  onSelectClient, 
  onNavigateToSection 
}: AdminHomeDashboardProps) {
  const [stats, setStats] = useState<DashboardStats>({
    totalClients: 0,
    activeClients: 0,
    onboardingClients: 0,
    stillOnboarding: 0,
    pendingDeliverables: 0,
    unreadMessages: 0,
    upcomingMeetings: 0,
    recentActivity: [],
    clientsNeedingAttention: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [allClients, setAllClients] = useState<Array<{ id: string; business_name: string; tier: string }>>([]);

  useEffect(() => {
    fetchDashboardStats();
  }, [adminPassword]);

  useEffect(() => {
    fetchAllClients();
  }, []);

  const fetchAllClients = async () => {
    const { data } = await supabase
      .from("client_accounts")
      .select("id, business_name, tier")
      .order("business_name", { ascending: true });
    setAllClients(data || []);
  };

  const fetchDashboardStats = async () => {
    setIsLoading(true);
    try {
      // Fetch clients
      const { data: clients } = await supabase
        .from("client_accounts")
        .select("id, business_name, status, tier");

      // Fetch onboarding workflows not yet completed
      const { data: workflows } = await supabase
        .from("client_workflows")
        .select("client_id, current_step, total_steps")
        .neq("status", "completed");

      // Fetch deliverables
      const { data: deliverables } = await supabase
        .from("deliverables")
        .select("id, status");

      // Fetch messages
      const { data: messages } = await supabase
        .from("client_messages")
        .select("id, is_read, sender_type")
        .eq("sender_type", "client")
        .eq("is_read", false);

      // Fetch upcoming meetings
      const { data: meetings } = await supabase
        .from("client_meetings")
        .select("id, scheduled_at")
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(5);

      // Fetch recent activity
      const { data: activity } = await supabase
        .from("activity_feed")
        .select("id, title, description, created_at, icon")
        .order("created_at", { ascending: false })
        .limit(5);

      // Find clients still mid-onboarding, least progress first
      const workflowByClient = new Map((workflows || []).map(w => [w.client_id, w]));
      const clientsNeedingAttention = (clients || [])
        .filter(c => workflowByClient.has(c.id))
        .map(c => {
          const wf = workflowByClient.get(c.id)!;
          return {
            id: c.id,
            business_name: c.business_name,
            tier: c.tier,
            currentStep: wf.current_step,
            totalSteps: wf.total_steps,
          };
        })
        .sort((a, b) => (a.currentStep / a.totalSteps) - (b.currentStep / b.totalSteps))
        .slice(0, 5);

      setStats({
        totalClients: clients?.length || 0,
        activeClients: clients?.filter(c => c.status === "active").length || 0,
        onboardingClients: clients?.filter(c => c.status === "onboarding").length || 0,
        stillOnboarding: workflowByClient.size,
        pendingDeliverables: deliverables?.filter(d => d.status === "pending").length || 0,
        unreadMessages: messages?.length || 0,
        upcomingMeetings: meetings?.length || 0,
        recentActivity: activity || [],
        clientsNeedingAttention,
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Welcome Back</h1>
          <p className="text-muted-foreground">Here's what's happening today</p>
        </div>
        <div className="flex items-center gap-3">
          <Select onValueChange={(value) => {
            const client = allClients.find(c => c.id === value);
            if (client) onSelectClient(client.id, client.business_name);
          }}>
            <SelectTrigger className="w-[220px]">
              <Building2 className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Jump to client..." />
            </SelectTrigger>
            <SelectContent>
              {allClients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  <div className="flex items-center gap-2">
                    <span>{client.business_name}</span>
                    <Badge variant="secondary" className="text-xs ml-1">{client.tier}</Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => onNavigateToSection("clients")} variant="outline" className="gap-2">
            <Users className="w-4 h-4" />
            Manage Clients
          </Button>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onNavigateToSection("clients")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalClients}</p>
                <p className="text-xs text-muted-foreground">Total Clients</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onNavigateToSection("clients")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.stillOnboarding}</p>
                <p className="text-xs text-muted-foreground">Still Onboarding</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onNavigateToSection("deliverables")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.pendingDeliverables}</p>
                <p className="text-xs text-muted-foreground">Pending Reviews</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onNavigateToSection("client-messages")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <MessageSquare className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.unreadMessages}</p>
                <p className="text-xs text-muted-foreground">Unread Messages</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Clients Needing Attention */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Clients Needing Attention
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.clientsNeedingAttention.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
                <p className="text-sm">All caught up! No urgent client work.</p>
              </div>
            ) : (
              stats.clientsNeedingAttention.map((client) => (
                <div
                  key={client.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                  onClick={() => onSelectClient(client.id, client.business_name)}
                >
                  <div>
                    <p className="font-medium">{client.business_name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">{client.tier}</Badge>
                      <span className="text-xs text-muted-foreground">
                        onboarding step {client.currentStep}/{client.totalSteps}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.recentActivity.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <p className="text-sm">No recent activity</p>
              </div>
            ) : (
              stats.recentActivity.map((activity) => (
                <div 
                  key={activity.id}
                  className="flex items-start gap-3 p-2"
                >
                  <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{activity.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(activity.created_at), "MMM d, h:mm a")}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => onNavigateToSection("pipeline")}>
              <TrendingUp className="w-5 h-5" />
              <span className="text-xs">Pipeline</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => onNavigateToSection("contacts")}>
              <Users className="w-5 h-5" />
              <span className="text-xs">Leads</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => onNavigateToSection("client-meetings")}>
              <Calendar className="w-5 h-5" />
              <span className="text-xs">Meetings</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => onNavigateToSection("alerts")}>
              <AlertTriangle className="w-5 h-5" />
              <span className="text-xs">Alerts</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
