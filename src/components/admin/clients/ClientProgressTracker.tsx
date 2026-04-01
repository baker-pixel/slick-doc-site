import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { 
  Users, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  ChevronRight,
  Package,
  TrendingUp,
  Calendar,
  FileText,
  Zap,
} from "lucide-react";
import { format } from "date-fns";

interface ClientProgressTrackerProps {
  adminPassword: string;
}

interface ClientAccount {
  id: string;
  business_name: string;
  email: string;
  tier: string;
  status: string;
  created_at: string;
}

interface ClientTask {
  id: string;
  name: string;
  description: string | null;
  category: string;
  status: string;
  automation_type: string;
  completed_at: string | null;
  client_account_id: string;
}

interface Deliverable {
  id: string;
  title: string;
  category: string;
  status: string;
  submitted_at: string;
  client_account_id: string;
}

const tierColors: Record<string, string> = {
  foundation: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  growth: "bg-purple-500/10 text-purple-600 border-purple-500/30",
  scale: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  transformation: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
};

const statusColors: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-500/10 text-blue-600",
  completed: "bg-emerald-500/10 text-emerald-600",
};

export default function ClientProgressTracker({ adminPassword }: ClientProgressTrackerProps) {
  const [selectedTier, setSelectedTier] = useState("all");
  const [expandedClient, setExpandedClient] = useState<string | null>(null);

  const { data: clients, isLoading: clientsLoading } = useQuery({
    queryKey: ["admin-clients-progress"],
    queryFn: async () => {
      const response = await supabase.functions.invoke("admin", {
        body: { action: "list", table: "client_accounts", password: adminPassword },
      });
      if (response.error) throw response.error;
      return response.data.data as ClientAccount[];
    },
  });

  const { data: allTasks } = useQuery({
    queryKey: ["admin-all-tasks"],
    queryFn: async () => {
      const response = await supabase.functions.invoke("admin", {
        body: { action: "list", table: "client_tasks", password: adminPassword },
      });
      if (response.error) throw response.error;
      return response.data.data as ClientTask[];
    },
  });

  const { data: allDeliverables } = useQuery({
    queryKey: ["admin-all-deliverables"],
    queryFn: async () => {
      const response = await supabase.functions.invoke("admin", {
        body: { action: "list_deliverables", password: adminPassword },
      });
      if (response.error) throw response.error;
      return response.data.data as Deliverable[];
    },
  });

  const getClientTasks = (clientId: string) => {
    return allTasks?.filter(t => t.client_account_id === clientId) || [];
  };

  const getClientDeliverables = (clientId: string) => {
    return allDeliverables?.filter(d => d.client_account_id === clientId) || [];
  };

  const getClientProgress = (clientId: string) => {
    const tasks = getClientTasks(clientId);
    if (tasks.length === 0) return 0;
    const completed = tasks.filter(t => t.status === "completed").length;
    return Math.round((completed / tasks.length) * 100);
  };

  const filteredClients = clients?.filter(c => 
    selectedTier === "all" || c.tier === selectedTier
  ) || [];

  // Calculate summary stats
  const totalClients = clients?.length || 0;
  const totalTasks = allTasks?.length || 0;
  const completedTasks = allTasks?.filter(t => t.status === "completed").length || 0;
  const pendingDeliverables = allDeliverables?.filter(d => d.status === "pending_review").length || 0;

  if (clientsLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Client Progress</h2>
            <p className="text-muted-foreground">Track task completion across all clients</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6">
                <div className="h-12 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Client Progress</h2>
          <p className="text-muted-foreground">Track task completion across all clients</p>
        </div>
        <Select value={selectedTier} onValueChange={setSelectedTier}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="foundation">Foundation</SelectItem>
            <SelectItem value="growth">Growth</SelectItem>
            <SelectItem value="transformation">Transformation</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Clients</p>
                <p className="text-2xl font-bold">{totalClients}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tasks Completed</p>
                <p className="text-2xl font-bold">{completedTasks}/{totalTasks}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-amber-500/10">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Reviews</p>
                <p className="text-2xl font-bold">{pendingDeliverables}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-500/10">
                <TrendingUp className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Completion Rate</p>
                <p className="text-2xl font-bold">
                  {totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Client List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Client Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredClients.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No clients found for the selected tier.</p>
            </div>
          ) : (
            <Accordion type="single" collapsible value={expandedClient || ""} onValueChange={setExpandedClient}>
              {filteredClients.map((client) => {
                const progress = getClientProgress(client.id);
                const tasks = getClientTasks(client.id);
                const deliverables = getClientDeliverables(client.id);
                const pendingTasks = tasks.filter(t => t.status === "pending").length;
                const pendingReviews = deliverables.filter(d => d.status === "pending_review").length;

                return (
                  <AccordionItem key={client.id} value={client.id} className="border rounded-lg mb-3 px-4">
                    <AccordionTrigger className="hover:no-underline py-4">
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-sm font-bold text-primary">
                              {client.business_name.charAt(0)}
                            </span>
                          </div>
                          <div className="text-left">
                            <p className="font-semibold">{client.business_name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className={tierColors[client.tier] || ""}>
                                {client.tier}
                              </Badge>
                              {pendingTasks > 0 && (
                                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                                  {pendingTasks} tasks pending
                                </Badge>
                              )}
                              {pendingReviews > 0 && (
                                <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">
                                  {pendingReviews} awaiting review
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">Progress</p>
                            <p className="font-bold text-lg">{progress}%</p>
                          </div>
                          <div className="w-32">
                            <Progress value={progress} className="h-2" />
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="pt-4 pb-2 space-y-6">
                        {/* Tasks Section */}
                        <div>
                          <h4 className="font-semibold text-sm text-muted-foreground mb-3 flex items-center gap-2">
                            <Zap className="h-4 w-4" />
                            Tasks ({tasks.length})
                          </h4>
                          {tasks.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No tasks created yet.</p>
                          ) : (
                            <div className="grid gap-2">
                              {tasks.slice(0, 10).map((task) => (
                                <div
                                  key={task.id}
                                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                                >
                                  <div className="flex items-center gap-3">
                                    {task.status === "completed" ? (
                                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                    ) : task.status === "in_progress" ? (
                                      <Clock className="h-5 w-5 text-blue-600" />
                                    ) : (
                                      <AlertCircle className="h-5 w-5 text-muted-foreground" />
                                    )}
                                    <div>
                                      <p className="text-sm font-medium">{task.name}</p>
                                      <p className="text-xs text-muted-foreground capitalize">
                                        {task.category.replace(/_/g, ' ')}
                                      </p>
                                    </div>
                                  </div>
                                  <Badge className={statusColors[task.status] || statusColors.pending}>
                                    {task.status.replace(/_/g, ' ')}
                                  </Badge>
                                </div>
                              ))}
                              {tasks.length > 10 && (
                                <p className="text-sm text-muted-foreground text-center py-2">
                                  + {tasks.length - 10} more tasks
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Deliverables Section */}
                        <div>
                          <h4 className="font-semibold text-sm text-muted-foreground mb-3 flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Deliverables ({deliverables.length})
                          </h4>
                          {deliverables.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No deliverables yet.</p>
                          ) : (
                            <div className="grid gap-2">
                              {deliverables.slice(0, 5).map((deliverable) => (
                                <div
                                  key={deliverable.id}
                                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                                >
                                  <div className="flex items-center gap-3">
                                    <FileText className="h-5 w-5 text-muted-foreground" />
                                    <div>
                                      <p className="text-sm font-medium">{deliverable.title}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {format(new Date(deliverable.submitted_at), "MMM d, yyyy")}
                                      </p>
                                    </div>
                                  </div>
                                  <Badge 
                                    className={
                                      deliverable.status === "approved" 
                                        ? "bg-emerald-500/10 text-emerald-600" 
                                        : deliverable.status === "pending_review"
                                        ? "bg-amber-500/10 text-amber-600"
                                        : "bg-blue-500/10 text-blue-600"
                                    }
                                  >
                                    {deliverable.status.replace(/_/g, ' ')}
                                  </Badge>
                                </div>
                              ))}
                              {deliverables.length > 5 && (
                                <p className="text-sm text-muted-foreground text-center py-2">
                                  + {deliverables.length - 5} more deliverables
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
