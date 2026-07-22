import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import {
  CheckCircle2,
  Circle,
  Clock,
  MessageSquare,
  FolderKanban,
  BarChart3,
  Send,
  Loader2,
  AlertCircle,
  Calendar,
  TrendingUp,
  Package,
  ExternalLink,
  RotateCcw,
  ThumbsUp,
  Edit3,
  Eye,
  Plus,
  Minus,
  ChevronRight,
  ChevronDown,
  Target,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface SelectedClient {
  id: string;
  business_name: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  tier: string;
  status: string;
  industry: string | null;
}

interface UnifiedClientViewProps {
  client: SelectedClient;
  adminPassword: string;
  onNavigateToSection?: (section: string) => void;
}

interface Task {
  id: string;
  name: string;
  description: string | null;
  status: string;
  category: string;
  due_date: string | null;
  automation_type: string;
}

interface Deliverable {
  id: string;
  title: string;
  status: string;
  category: string;
  submitted_at: string;
}

interface Message {
  id: string;
  message: string;
  sender_type: string;
  sender_name: string | null;
  is_read: boolean;
  created_at: string;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  progress_percentage: number | null;
  start_date: string | null;
  target_end_date: string | null;
  created_at: string;
  updated_at: string;
}

interface Milestone {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  due_date: string | null;
  status: string;
  completed_at: string | null;
  sort_order: number;
}

interface Meeting {
  id: string;
  title: string;
  scheduled_at: string;
  status: string;
  meeting_type: string;
}

export function UnifiedClientView({ client, adminPassword, onNavigateToSection }: UnifiedClientViewProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  useEffect(() => {
    fetchAllData();
  }, [client.id]);

  const fetchAllData = async () => {
    setIsLoading(true);
    await Promise.all([
      fetchTasks(),
      fetchDeliverables(),
      fetchMessages(),
      fetchProjects(),
      fetchMilestones(),
      fetchMeetings(),
    ]);
    setIsLoading(false);
  };

  const fetchTasks = async () => {
    const res = await supabase.functions.invoke("admin", {
      body: { action: "list", table: "client_tasks", password: adminPassword },
    });

    if (!res.error) {
      const rows = (res.data?.data || []) as Task[];
      setTasks(rows.filter((t) => (t as any).client_account_id === client.id));
    } else {
      const msg = await getEdgeErrorMessage(res.error, res.data);
      toast({ title: "Failed to load tasks", description: msg ? friendlyEdgeMessage(msg) : "Something went wrong", variant: "destructive" });
    }
  };

  const fetchDeliverables = async () => {
    const res = await supabase.functions.invoke("admin", {
      body: { action: "list", table: "deliverables", password: adminPassword },
    });

    if (!res.error) {
      const rows = (res.data?.data || []) as any[];
      // keep newest first
      const filtered = rows
        .filter((d) => d.client_account_id === client.id)
        .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
      setDeliverables(filtered);
    } else {
      const msg = await getEdgeErrorMessage(res.error, res.data);
      toast({ title: "Failed to load deliverables", description: msg ? friendlyEdgeMessage(msg) : "Something went wrong", variant: "destructive" });
    }
  };

  const fetchMessages = async () => {
    const res = await supabase.functions.invoke("admin", {
      body: { action: "get_messages", password: adminPassword, data: { client_account_id: client.id } },
    });

    if (!res.error) {
      const rows = (res.data?.data || []) as Message[];
      // API returns ascending; store as newest first
      setMessages(rows.slice().reverse());
    } else {
      const msg = await getEdgeErrorMessage(res.error, res.data);
      toast({ title: "Failed to load messages", description: msg ? friendlyEdgeMessage(msg) : "Something went wrong", variant: "destructive" });
    }
  };

  const fetchProjects = async () => {
    const res = await supabase.functions.invoke("admin", {
      body: { action: "list", table: "client_projects", password: adminPassword },
    });

    if (!res.error) {
      const rows = (res.data?.data || []) as any[];
      const filtered = rows
        .filter((p) => p.client_account_id === client.id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setProjects(filtered);
      
      // Auto-expand first in-progress project
      const inProgress = filtered.find((p: Project) => p.status === "in_progress");
      if (inProgress) {
        setExpandedProject(inProgress.id);
      }
    } else {
      const msg = await getEdgeErrorMessage(res.error, res.data);
      toast({ title: "Failed to load projects", description: msg ? friendlyEdgeMessage(msg) : "Something went wrong", variant: "destructive" });
    }
  };

  const fetchMilestones = async () => {
    const res = await supabase.functions.invoke("admin", {
      body: { action: "list", table: "project_milestones", password: adminPassword },
    });

    if (!res.error) {
      const rows = (res.data?.data || []) as any[];
      setMilestones(rows.sort((a, b) => a.sort_order - b.sort_order));
    } else {
      const msg = await getEdgeErrorMessage(res.error, res.data);
      toast({ title: "Failed to load milestones", description: msg ? friendlyEdgeMessage(msg) : "Something went wrong", variant: "destructive" });
    }
  };

  const getProjectMilestones = (projectId: string) => {
    return milestones.filter((m) => m.project_id === projectId);
  };

  const fetchMeetings = async () => {
    const res = await supabase.functions.invoke("admin", {
      body: { action: "list", table: "client_meetings", password: adminPassword },
    });

    if (!res.error) {
      const rows = (res.data?.data || []) as any[];
      const upcoming = rows
        .filter((m) => m.client_account_id === client.id)
        .filter((m) => new Date(m.scheduled_at) >= new Date())
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
        .slice(0, 5);

      setMeetings(upcoming);
    } else {
      const msg = await getEdgeErrorMessage(res.error, res.data);
      toast({ title: "Failed to load meetings", description: msg ? friendlyEdgeMessage(msg) : "Something went wrong", variant: "destructive" });
    }
  };

  const completeTask = async (taskId: string) => {
    const res = await supabase.functions.invoke("admin", {
      body: {
        action: "update",
        table: "client_tasks",
        id: taskId,
        data: { status: "completed", completed_at: new Date().toISOString() },
        password: adminPassword,
      },
    });

    if (!res.error) {
      toast({ title: "Task completed!" });
      fetchTasks();
    } else {
      const msg = await getEdgeErrorMessage(res.error, res.data);
      toast({ title: "Failed to complete task", description: msg ? friendlyEdgeMessage(msg) : "Something went wrong", variant: "destructive" });
    }
  };

  const reopenTask = async (taskId: string) => {
    const res = await supabase.functions.invoke("admin", {
      body: {
        action: "update",
        table: "client_tasks",
        id: taskId,
        data: { status: "pending", completed_at: null },
        password: adminPassword,
      },
    });

    if (!res.error) {
      toast({ title: "Task reopened" });
      fetchTasks();
    } else {
      const msg = await getEdgeErrorMessage(res.error, res.data);
      toast({ title: "Failed to reopen task", description: msg ? friendlyEdgeMessage(msg) : "Something went wrong", variant: "destructive" });
    }
  };

  const updateDeliverable = async (deliverableId: string, status: string) => {
    const res = await supabase.functions.invoke("admin", {
      body: {
        action: "update",
        table: "deliverables",
        id: deliverableId,
        data: { status, reviewed_at: new Date().toISOString() },
        password: adminPassword,
      },
    });

    if (!res.error) {
      toast({ title: status === "approved" ? "Deliverable approved!" : "Revision requested" });
      fetchDeliverables();
    } else {
      const msg = await getEdgeErrorMessage(res.error, res.data);
      toast({ title: status === "approved" ? "Failed to approve deliverable" : "Failed to request revision", description: msg ? friendlyEdgeMessage(msg) : "Something went wrong", variant: "destructive" });
    }
  };

  const markMessageRead = async (messageId: string) => {
    await supabase.functions.invoke("admin", {
      body: {
        action: "update",
        table: "client_messages",
        id: messageId,
        data: { is_read: true },
        password: adminPassword,
      },
    });
    fetchMessages();
  };

  const updateProjectProgress = async (projectId: string, progress: number) => {
    const res = await supabase.functions.invoke("admin", {
      body: {
        action: "update",
        table: "client_projects",
        id: projectId,
        data: {
          progress_percentage: progress,
          status: progress >= 100 ? "completed" : "in_progress"
        },
        password: adminPassword,
      },
    });

    if (!res.error) {
      toast({ title: progress >= 100 ? "Project completed!" : "Progress updated" });
      fetchProjects();
    } else {
      const msg = await getEdgeErrorMessage(res.error, res.data);
      toast({ title: "Failed to update progress", description: msg ? friendlyEdgeMessage(msg) : "Something went wrong", variant: "destructive" });
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    setSendingMessage(true);

    const res = await supabase.functions.invoke("admin", {
      body: {
        action: "send_message",
        password: adminPassword,
        data: {
          client_account_id: client.id,
          message: newMessage,
          sender_name: "Agency Team",
        },
      },
    });

    if (!res.error) {
      setNewMessage("");
      fetchMessages();
      toast({ title: "Message sent!" });
    } else {
      const msg = await getEdgeErrorMessage(res.error, res.data);
      toast({ title: "Failed to send message", description: msg ? friendlyEdgeMessage(msg) : "Something went wrong", variant: "destructive" });
    }

    setSendingMessage(false);
  };

  // Stats
  const pendingTasks = tasks.filter((t) => t.status === "pending").length;
  const completedTasks = tasks.filter((t) => t.status === "completed").length;
  const pendingDeliverables = deliverables.filter((d) => d.status === "pending_review").length;
  const unreadMessages = messages.filter((m) => !m.is_read && m.sender_type === "client").length;
  const activeProjects = projects.filter((p) => p.status === "in_progress").length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className={cn("cursor-pointer hover:border-primary/50", activeTab === "tasks" && "border-primary")} onClick={() => setActiveTab("tasks")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", pendingTasks > 0 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700")}>
                {pendingTasks > 0 ? <Clock className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingTasks}</p>
                <p className="text-xs text-muted-foreground">Pending Tasks</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={cn("cursor-pointer hover:border-primary/50", activeTab === "deliverables" && "border-primary")} onClick={() => setActiveTab("deliverables")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", pendingDeliverables > 0 ? "bg-blue-100 text-blue-700" : "bg-muted")}>
                <Package className="w-4 h-4" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingDeliverables}</p>
                <p className="text-xs text-muted-foreground">Awaiting Review</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={cn("cursor-pointer hover:border-primary/50", activeTab === "messages" && "border-primary")} onClick={() => setActiveTab("messages")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", unreadMessages > 0 ? "bg-red-100 text-red-700" : "bg-muted")}>
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <p className="text-2xl font-bold">{unreadMessages}</p>
                <p className="text-xs text-muted-foreground">Unread Messages</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={cn("cursor-pointer hover:border-primary/50", activeTab === "projects" && "border-primary")} onClick={() => setActiveTab("projects")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 text-purple-700">
                <FolderKanban className="w-4 h-4" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeProjects}</p>
                <p className="text-xs text-muted-foreground">Active Projects</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <p className="text-2xl font-bold">{completedTasks}</p>
                <p className="text-xs text-muted-foreground">Tasks Done</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span className="hidden sm:inline">Tasks</span>
            {pendingTasks > 0 && <Badge variant="secondary" className="ml-1">{pendingTasks}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="deliverables" className="gap-2">
            <Package className="w-4 h-4" />
            <span className="hidden sm:inline">Deliverables</span>
          </TabsTrigger>
          <TabsTrigger value="messages" className="gap-2">
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">Messages</span>
            {unreadMessages > 0 && <Badge variant="destructive" className="ml-1">{unreadMessages}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="projects" className="gap-2">
            <FolderKanban className="w-4 h-4" />
            <span className="hidden sm:inline">Projects</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Upcoming Meetings */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Upcoming Meetings
                  </CardTitle>
                  {onNavigateToSection && (
                    <Button variant="ghost" size="sm" onClick={() => onNavigateToSection("client-meetings")} className="gap-1 text-xs">
                      View All <ExternalLink className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {meetings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No upcoming meetings</p>
                ) : (
                  <div className="space-y-2">
                    {meetings.slice(0, 3).map((meeting) => (
                      <div key={meeting.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted transition-colors" onClick={() => onNavigateToSection?.("client-meetings")}>
                        <div>
                          <p className="text-sm font-medium">{meeting.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(meeting.scheduled_at), "MMM d, h:mm a")}
                          </p>
                        </div>
                        <Badge variant="outline">{meeting.meeting_type}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Priority Tasks */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Priority Tasks
                  </CardTitle>
                  {onNavigateToSection && (
                    <Button variant="ghost" size="sm" onClick={() => onNavigateToSection("client-tasks")} className="gap-1 text-xs">
                      View All <ExternalLink className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {tasks.filter((t) => t.status === "pending").length === 0 ? (
                  <div className="text-center py-4">
                    <CheckCircle2 className="w-8 h-8 mx-auto text-green-500 mb-2" />
                    <p className="text-sm text-muted-foreground">All caught up!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tasks
                      .filter((t) => t.status === "pending")
                      .slice(0, 3)
                      .map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted transition-colors"
                          onClick={() => {
                            try {
                              sessionStorage.setItem("admin:selectedTaskId", task.id);
                            } catch {
                              // ignore
                            }
                            onNavigateToSection?.("client-tasks");
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{task.name}</p>
                            <p className="text-xs text-muted-foreground">{task.category}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              try {
                                sessionStorage.setItem("admin:selectedTaskId", task.id);
                              } catch {
                                // ignore
                              }
                              onNavigateToSection?.("client-tasks");
                            }}
                            className="gap-1"
                          >
                            <Eye className="w-4 h-4" />
                            <span className="hidden sm:inline">Open</span>
                          </Button>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className="md:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Recent Messages</CardTitle>
                  {onNavigateToSection && (
                    <Button variant="ghost" size="sm" onClick={() => onNavigateToSection("client-messages")} className="gap-1 text-xs">
                      View All <ExternalLink className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No messages yet</p>
                ) : (
                  <div className="space-y-3">
                    {messages.slice(0, 4).map((msg) => (
                      <div key={msg.id} className={cn("p-3 rounded-lg cursor-pointer hover:opacity-80 transition-opacity", msg.sender_type === "client" ? "bg-muted/50" : "bg-primary/5")} onClick={() => onNavigateToSection?.("client-messages")}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium">
                            {msg.sender_type === "client" ? client.business_name : "Team"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(msg.created_at), "MMM d, h:mm a")}
                          </span>
                        </div>
                        <p className="text-sm">{msg.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks">
          <Card>
            <CardHeader>
              <CardTitle>Tasks</CardTitle>
              <CardDescription>{pendingTasks} pending, {completedTasks} completed</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors",
                        task.status === "completed" && "opacity-60 bg-muted/30"
                      )}
                      onClick={() => {
                        try {
                          sessionStorage.setItem("admin:selectedTaskId", task.id);
                        } catch {
                          // ignore
                        }
                        onNavigateToSection?.("client-tasks");
                      }}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          try {
                            sessionStorage.setItem("admin:selectedTaskId", task.id);
                          } catch {
                            // ignore
                          }
                          onNavigateToSection?.("client-tasks");
                        }}
                        title="Open task"
                      >
                        <Eye className="w-5 h-5" />
                      </Button>
                      <div className="flex-1 min-w-0">
                        <p className={cn("font-medium", task.status === "completed" && "line-through")}>
                          {task.name}
                        </p>
                        {task.description && (
                          <p className="text-sm text-muted-foreground truncate">{task.description}</p>
                        )}
                      </div>
                      <Badge variant="outline">{task.category}</Badge>
                      {task.automation_type !== "MANUAL" && (
                        <Badge variant="secondary" className="bg-violet-100 text-violet-700">AI</Badge>
                      )}
                      {task.status === "completed" && (
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); reopenTask(task.id); }} className="gap-1">
                          <RotateCcw className="w-3 h-3" />
                          Reopen
                        </Button>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Deliverables Tab */}
        <TabsContent value="deliverables">
          <Card>
            <CardHeader>
              <CardTitle>Deliverables</CardTitle>
              <CardDescription>{deliverables.length} total deliverables</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] pr-4">
                {deliverables.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No deliverables yet</p>
                ) : (
                  <div className="space-y-2">
                    {deliverables.map((d) => (
                      <div key={d.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex-1">
                          <p className="font-medium">{d.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(d.submitted_at), "MMM d, yyyy")} • {d.category}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {d.status === "pending_review" ? (
                            <>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="gap-1 text-green-600 border-green-200 hover:bg-green-50"
                                onClick={() => updateDeliverable(d.id, "approved")}
                              >
                                <ThumbsUp className="w-3 h-3" />
                                Approve
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                className="gap-1"
                                onClick={() => updateDeliverable(d.id, "revision_requested")}
                              >
                                <Edit3 className="w-3 h-3" />
                                Request Revision
                              </Button>
                            </>
                          ) : (
                            <Badge
                              variant={d.status === "approved" ? "default" : "outline"}
                              className={d.status === "approved" ? "bg-green-100 text-green-700" : ""}
                            >
                              {d.status.replace("_", " ")}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Messages Tab */}
        <TabsContent value="messages">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Messages</CardTitle>
                {unreadMessages > 0 && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      messages.filter(m => !m.is_read && m.sender_type === "client").forEach(m => markMessageRead(m.id));
                    }}
                    className="gap-1"
                  >
                    <Eye className="w-3 h-3" />
                    Mark all read
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ScrollArea className="h-[400px] pr-4">
                {messages.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No messages yet</p>
                ) : (
                  <div className="space-y-3">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={cn(
                          "p-3 rounded-lg relative",
                          msg.sender_type === "client" ? "bg-muted/50" : "bg-primary/10 ml-8",
                          !msg.is_read && msg.sender_type === "client" && "border-l-4 border-l-primary"
                        )}
                        onClick={() => !msg.is_read && msg.sender_type === "client" && markMessageRead(msg.id)}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium">
                            {msg.sender_type === "client" ? client.business_name : "Team"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(msg.created_at), "MMM d, h:mm a")}
                          </span>
                          {!msg.is_read && msg.sender_type === "client" && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">New</Badge>
                          )}
                        </div>
                        <p className="text-sm">{msg.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              <div className="flex gap-2 pt-4 border-t">
                <Textarea
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="min-h-[60px]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                />
                <Button onClick={sendMessage} disabled={sendingMessage || !newMessage.trim()}>
                  {sendingMessage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Projects Tab */}
        <TabsContent value="projects">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Projects</CardTitle>
                  <CardDescription>
                    {projects.length} total projects • {projects.filter(p => p.status === "in_progress").length} in progress
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                {projects.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No projects yet</p>
                ) : (
                  <div className="space-y-4">
                    {projects.map((project) => {
                      const projectMilestones = getProjectMilestones(project.id);
                      const completedMilestones = projectMilestones.filter(m => m.status === "completed").length;
                      const isExpanded = expandedProject === project.id;
                      
                      return (
                        <div 
                          key={project.id} 
                          className={cn(
                            "rounded-lg border transition-all",
                            isExpanded && "ring-2 ring-primary/20"
                          )}
                        >
                          {/* Project Header */}
                          <div 
                            className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => setExpandedProject(isExpanded ? null : project.id)}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-6 w-6 shrink-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedProject(isExpanded ? null : project.id);
                                    }}
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="w-4 h-4" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4" />
                                    )}
                                  </Button>
                                  <h3 className="font-semibold truncate">{project.name}</h3>
                                  <Badge
                                    variant={project.status === "completed" ? "default" : project.status === "in_progress" ? "secondary" : "outline"}
                                    className={cn(
                                      "shrink-0",
                                      project.status === "completed" && "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                                    )}
                                  >
                                    {project.status.replace("_", " ")}
                                  </Badge>
                                </div>
                                
                                {project.description && (
                                  <p className="text-sm text-muted-foreground ml-8 line-clamp-2">
                                    {project.description}
                                  </p>
                                )}
                                
                                {/* Quick Stats Row */}
                                <div className="flex items-center gap-4 mt-2 ml-8 text-xs text-muted-foreground">
                                  {project.start_date && (
                                    <span className="flex items-center gap-1">
                                      <CalendarDays className="w-3 h-3" />
                                      Started: {format(new Date(project.start_date), "MMM d, yyyy")}
                                    </span>
                                  )}
                                  {project.target_end_date && (
                                    <span className={cn(
                                      "flex items-center gap-1",
                                      new Date(project.target_end_date) < new Date() && project.status !== "completed" && "text-destructive"
                                    )}>
                                      <Target className="w-3 h-3" />
                                      Due: {format(new Date(project.target_end_date), "MMM d, yyyy")}
                                    </span>
                                  )}
                                  {projectMilestones.length > 0 && (
                                    <span className="flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" />
                                      {completedMilestones}/{projectMilestones.length} milestones
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            {/* Progress Bar */}
                            <div className="mt-3 ml-8">
                              <div className="flex items-center gap-3">
                                <Button 
                                  variant="outline" 
                                  size="icon" 
                                  className="h-7 w-7 shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateProjectProgress(project.id, Math.max(0, (project.progress_percentage || 0) - 10));
                                  }}
                                  disabled={project.progress_percentage === 0}
                                >
                                  <Minus className="w-3 h-3" />
                                </Button>
                                <div className="flex-1">
                                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={cn(
                                        "h-full transition-all duration-300",
                                        project.progress_percentage === 100 ? "bg-green-500" : "bg-primary"
                                      )}
                                      style={{ width: `${project.progress_percentage || 0}%` }}
                                    />
                                  </div>
                                </div>
                                <span className="text-sm font-medium w-12 text-right">
                                  {project.progress_percentage || 0}%
                                </span>
                                <Button 
                                  variant="outline" 
                                  size="icon"
                                  className="h-7 w-7 shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateProjectProgress(project.id, Math.min(100, (project.progress_percentage || 0) + 10));
                                  }}
                                  disabled={project.progress_percentage === 100}
                                >
                                  <Plus className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                          
                          {/* Expanded Content - Milestones */}
                          {isExpanded && (
                            <div className="border-t bg-muted/30 p-4">
                              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                                <Target className="w-4 h-4" />
                                Milestones
                              </h4>
                              {projectMilestones.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No milestones defined for this project</p>
                              ) : (
                                <div className="space-y-2">
                                  {projectMilestones.map((milestone) => (
                                    <div 
                                      key={milestone.id}
                                      className={cn(
                                        "flex items-start gap-3 p-3 rounded-lg border bg-background",
                                        milestone.status === "completed" && "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                                      )}
                                    >
                                      <div className="mt-0.5">
                                        {milestone.status === "completed" ? (
                                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                                        ) : milestone.status === "in_progress" ? (
                                          <Clock className="w-4 h-4 text-primary" />
                                        ) : (
                                          <Circle className="w-4 h-4 text-muted-foreground" />
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className={cn(
                                            "font-medium text-sm",
                                            milestone.status === "completed" && "line-through text-muted-foreground"
                                          )}>
                                            {milestone.name}
                                          </span>
                                          <Badge 
                                            variant="outline" 
                                            className={cn(
                                              "text-[10px] px-1.5",
                                              milestone.status === "completed" && "bg-green-100 text-green-700 border-green-200",
                                              milestone.status === "in_progress" && "bg-blue-100 text-blue-700 border-blue-200"
                                            )}
                                          >
                                            {milestone.status.replace("_", " ")}
                                          </Badge>
                                        </div>
                                        {milestone.description && (
                                          <p className="text-xs text-muted-foreground mt-1">
                                            {milestone.description}
                                          </p>
                                        )}
                                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                          {milestone.due_date && (
                                            <span className={cn(
                                              "flex items-center gap-1",
                                              new Date(milestone.due_date) < new Date() && milestone.status !== "completed" && "text-destructive"
                                            )}>
                                              <Calendar className="w-3 h-3" />
                                              Due: {format(new Date(milestone.due_date), "MMM d")}
                                            </span>
                                          )}
                                          {milestone.completed_at && (
                                            <span className="flex items-center gap-1 text-green-600">
                                              <CheckCircle2 className="w-3 h-3" />
                                              Completed: {format(new Date(milestone.completed_at), "MMM d")}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {/* Project Meta Info */}
                              <div className="mt-4 pt-3 border-t text-xs text-muted-foreground">
                                <span>Created: {format(new Date(project.created_at), "MMM d, yyyy")}</span>
                                {project.updated_at !== project.created_at && (
                                  <span className="ml-4">Last updated: {format(new Date(project.updated_at), "MMM d, yyyy")}</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
