import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TierBadge } from "./TierBadge";
import { toast } from "sonner";
import { format, formatDistanceToNow, isAfter, isBefore, addDays } from "date-fns";
import {
  Search,
  Building2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  MessageSquare,
  Calendar,
  FileCheck,
  TrendingUp,
  Activity,
  ChevronRight,
  Send,
  Play,
  Heart,
  RefreshCw
} from "lucide-react";

interface UnifiedClientDashboardProps {
  adminPassword: string;
  onNavigateToSection?: (section: string) => void;
}

interface ClientAccount {
  id: string;
  business_name: string;
  email: string;
  tier: string;
  status: string;
  industry: string | null;
  created_at: string;
}

export function UnifiedClientDashboard({ adminPassword, onNavigateToSection }: UnifiedClientDashboardProps) {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();

  // Fetch clients
  const { data: clients = [] } = useQuery({
    queryKey: ["unified-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_accounts")
        .select("*")
        .order("business_name");
      if (error) throw error;
      return data as ClientAccount[];
    }
  });

  // Health scores - calculated from tasks/activity (no separate table yet)
  const healthScores: any[] = [];

  // Fetch tasks for selected client
  const { data: clientTasks = [] } = useQuery({
    queryKey: ["unified-client-tasks", selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return [];
      const { data, error } = await supabase
        .from("client_tasks")
        .select("*")
        .eq("client_account_id", selectedClientId)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedClientId
  });

  // Fetch messages for selected client
  const { data: clientMessages = [] } = useQuery({
    queryKey: ["unified-client-messages", selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return [];
      const { data, error } = await supabase
        .from("client_messages")
        .select("*")
        .eq("client_account_id", selectedClientId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedClientId
  });

  // Fetch meetings for selected client
  const { data: clientMeetings = [] } = useQuery({
    queryKey: ["unified-client-meetings", selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return [];
      const { data, error } = await supabase
        .from("client_meetings")
        .select("*")
        .eq("client_account_id", selectedClientId)
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedClientId
  });

  // Fetch deliverables for selected client
  const { data: clientDeliverables = [] } = useQuery({
    queryKey: ["unified-client-deliverables", selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return [];
      const { data, error } = await supabase
        .from("deliverables")
        .select("*")
        .eq("client_account_id", selectedClientId)
        .order("submitted_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedClientId
  });

  // Fetch activity feed for selected client
  const { data: clientActivity = [] } = useQuery({
    queryKey: ["unified-client-activity", selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return [];
      const { data, error } = await supabase
        .from("activity_feed")
        .select("*")
        .eq("client_account_id", selectedClientId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedClientId
  });

  // Quick task completion mutation
  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("client_tasks")
        .update({ 
          status: "completed", 
          completed_at: new Date().toISOString(),
          completed_by: "Admin"
        })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unified-client-tasks"] });
      toast.success("Task completed!");
    }
  });

  const selectedClient = useMemo(() => {
    return clients.find(c => c.id === selectedClientId);
  }, [clients, selectedClientId]);

  const clientHealthScore = useMemo(() => {
    if (!selectedClientId) return null;
    return healthScores.find(h => h.client_account_id === selectedClientId);
  }, [healthScores, selectedClientId]);

  const filteredClients = useMemo(() => {
    if (!searchQuery) return clients;
    const query = searchQuery.toLowerCase();
    return clients.filter(c => 
      c.business_name.toLowerCase().includes(query) ||
      c.email.toLowerCase().includes(query) ||
      c.tier.toLowerCase().includes(query)
    );
  }, [clients, searchQuery]);

  const pendingTasks = clientTasks.filter(t => t.status === "pending");
  const inProgressTasks = clientTasks.filter(t => t.status === "in_progress");
  const overdueTasks = clientTasks.filter(t => 
    t.due_date && isBefore(new Date(t.due_date), new Date()) && t.status !== "completed"
  );
  const unreadMessages = clientMessages.filter(m => !m.is_read && m.sender_type === "client");

  const getHealthColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    if (score >= 40) return "text-orange-500";
    return "text-red-500";
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case "scale": return "bg-purple-100 text-purple-800";
      case "growth": return "bg-blue-100 text-blue-800";
      case "foundation": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Unified Client Dashboard</h2>
          <p className="text-muted-foreground">
            Everything you need to manage clients in one place
          </p>
        </div>
        <Button variant="outline" onClick={() => queryClient.invalidateQueries()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Client Selector Panel */}
        <Card className="col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Clients</CardTitle>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-350px)]">
              <div className="space-y-1 p-2">
                {filteredClients.map((client) => {
                  const health = healthScores.find(h => h.client_account_id === client.id);
                  return (
                    <button
                      key={client.id}
                      onClick={() => setSelectedClientId(client.id)}
                      className={`w-full text-left p-3 rounded-lg transition-colors ${
                        selectedClientId === client.id
                          ? "bg-primary/10 border border-primary"
                          : "hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium truncate max-w-[140px]">
                            {client.business_name}
                          </span>
                        </div>
                        {health && (
                          <Heart className={`h-4 w-4 ${getHealthColor(health.overall_score)}`} />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className={`text-xs ${getTierColor(client.tier)}`}>
                          {client.tier}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {client.status}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Main Content Area */}
        <div className="col-span-9 space-y-6">
          {selectedClient ? (
            <>
              {/* Client Header */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-2xl font-bold">{selectedClient.business_name}</h3>
                      <p className="text-muted-foreground">{selectedClient.email}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge className={getTierColor(selectedClient.tier)}>
                          {selectedClient.tier} tier
                        </Badge>
                        {selectedClient.industry && (
                          <Badge variant="outline">{selectedClient.industry}</Badge>
                        )}
                        <span className="text-sm text-muted-foreground">
                          Client since {format(new Date(selectedClient.created_at), "MMM yyyy")}
                        </span>
                      </div>
                    </div>
                    {clientHealthScore && (
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">Health Score</div>
                        <div className={`text-4xl font-bold ${getHealthColor(clientHealthScore.overall_score)}`}>
                          {clientHealthScore.overall_score}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quick Stats */}
                  <div className="grid grid-cols-5 gap-4 mt-6">
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold text-orange-500">{pendingTasks.length}</div>
                      <div className="text-xs text-muted-foreground">Pending Tasks</div>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-500">{inProgressTasks.length}</div>
                      <div className="text-xs text-muted-foreground">In Progress</div>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold text-red-500">{overdueTasks.length}</div>
                      <div className="text-xs text-muted-foreground">Overdue</div>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold text-green-500">{unreadMessages.length}</div>
                      <div className="text-xs text-muted-foreground">Unread Messages</div>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold text-purple-500">{clientMeetings.length}</div>
                      <div className="text-xs text-muted-foreground">Upcoming Meetings</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tabbed Content */}
              <Tabs defaultValue="tasks" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="tasks" className="relative">
                    Tasks
                    {pendingTasks.length > 0 && (
                      <span className="ml-2 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
                        {pendingTasks.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="messages">
                    Messages
                    {unreadMessages.length > 0 && (
                      <span className="ml-2 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                        {unreadMessages.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="deliverables">Deliverables</TabsTrigger>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                </TabsList>

                <TabsContent value="tasks" className="space-y-4">
                  {overdueTasks.length > 0 && (
                    <Card className="border-red-200 bg-red-50">
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm text-red-700 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          Overdue Tasks ({overdueTasks.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="py-0 pb-3">
                        <div className="space-y-2">
                          {overdueTasks.map(task => (
                            <div key={task.id} className="flex items-center justify-between bg-white p-3 rounded-lg">
                              <div>
                                <div className="font-medium">{task.name}</div>
                                <div className="text-sm text-red-600">
                                  Due {formatDistanceToNow(new Date(task.due_date!), { addSuffix: true })}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => completeTaskMutation.mutate(task.id)}
                                disabled={completeTaskMutation.isPending}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                Complete
                              </Button>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <div className="grid gap-3">
                    {clientTasks.filter(t => t.status !== "completed").slice(0, 10).map(task => (
                      <Card key={task.id}>
                        <CardContent className="py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${
                                task.status === "in_progress" ? "bg-blue-500" : "bg-orange-500"
                              }`} />
                              <div>
                                <div className="font-medium">{task.name}</div>
                                <div className="text-sm text-muted-foreground">
                                  {task.category} • {task.automation_type}
                                  {task.due_date && (
                                    <span className="ml-2">
                                      Due {format(new Date(task.due_date), "MMM d")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{task.status}</Badge>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => completeTaskMutation.mutate(task.id)}
                                disabled={completeTaskMutation.isPending}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="messages" className="space-y-4">
                  <div className="grid gap-3">
                    {clientMessages.map(message => (
                      <Card key={message.id} className={!message.is_read && message.sender_type === "client" ? "border-green-200" : ""}>
                        <CardContent className="py-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <MessageSquare className={`h-5 w-5 mt-0.5 ${
                                message.sender_type === "client" ? "text-green-500" : "text-blue-500"
                              }`} />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">
                                    {message.sender_name || message.sender_type}
                                  </span>
                                  {!message.is_read && message.sender_type === "client" && (
                                    <Badge variant="secondary" className="text-xs">New</Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                  {message.message}
                                </p>
                              </div>
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="deliverables" className="space-y-4">
                  <div className="grid gap-3">
                    {clientDeliverables.map(deliverable => (
                      <Card key={deliverable.id}>
                        <CardContent className="py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <FileCheck className={`h-5 w-5 ${
                                deliverable.status === "approved" ? "text-green-500" :
                                deliverable.status === "pending_review" ? "text-orange-500" : "text-gray-500"
                              }`} />
                              <div>
                                <div className="font-medium">{deliverable.title}</div>
                                <div className="text-sm text-muted-foreground">
                                  {deliverable.category} • {format(new Date(deliverable.submitted_at), "MMM d, yyyy")}
                                </div>
                              </div>
                            </div>
                            <Badge variant={
                              deliverable.status === "approved" ? "default" :
                              deliverable.status === "pending_review" ? "secondary" : "outline"
                            }>
                              {deliverable.status.replace("_", " ")}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="activity" className="space-y-4">
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {clientActivity.map(activity => (
                        <div key={activity.id} className="flex items-start gap-3 p-3 border rounded-lg">
                          <Activity className="h-4 w-4 mt-0.5 text-muted-foreground" />
                          <div className="flex-1">
                            <div className="font-medium text-sm">{activity.title}</div>
                            {activity.description && (
                              <p className="text-sm text-muted-foreground">{activity.description}</p>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <Card className="h-[500px] flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">Select a client to get started</p>
                <p className="text-sm">Choose a client from the list to view their dashboard</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}