import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  MessageSquare,
  FolderKanban,
  BarChart3,
  Send,
  Loader2,
  AlertCircle,
  Calendar,
  DollarSign,
  Star,
  TrendingUp,
  Package,
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
  status: string;
  progress_percentage: number | null;
}

interface Meeting {
  id: string;
  title: string;
  scheduled_at: string;
  status: string;
  meeting_type: string;
}

export function UnifiedClientView({ client }: UnifiedClientViewProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

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
      fetchMeetings(),
    ]);
    setIsLoading(false);
  };

  const fetchTasks = async () => {
    const { data } = await supabase
      .from("client_tasks")
      .select("*")
      .eq("client_account_id", client.id)
      .order("created_at", { ascending: false });
    if (data) setTasks(data);
  };

  const fetchDeliverables = async () => {
    const { data } = await supabase
      .from("deliverables")
      .select("*")
      .eq("client_account_id", client.id)
      .order("submitted_at", { ascending: false });
    if (data) setDeliverables(data);
  };

  const fetchMessages = async () => {
    const { data } = await supabase
      .from("client_messages")
      .select("*")
      .eq("client_account_id", client.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setMessages(data);
  };

  const fetchProjects = async () => {
    const { data } = await supabase
      .from("client_projects")
      .select("*")
      .eq("client_account_id", client.id)
      .order("created_at", { ascending: false });
    if (data) setProjects(data);
  };

  const fetchMeetings = async () => {
    const { data } = await supabase
      .from("client_meetings")
      .select("*")
      .eq("client_account_id", client.id)
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(5);
    if (data) setMeetings(data);
  };

  const completeTask = async (taskId: string) => {
    await supabase
      .from("client_tasks")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", taskId);
    
    toast({ title: "Task completed!" });
    fetchTasks();
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    setSendingMessage(true);

    const { error } = await supabase.from("client_messages").insert({
      client_account_id: client.id,
      message: newMessage,
      sender_type: "admin",
      sender_name: "Team",
      is_read: true,
    });

    if (!error) {
      setNewMessage("");
      fetchMessages();
      toast({ title: "Message sent!" });
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
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Upcoming Meetings
                </CardTitle>
              </CardHeader>
              <CardContent>
                {meetings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No upcoming meetings</p>
                ) : (
                  <div className="space-y-2">
                    {meetings.slice(0, 3).map((meeting) => (
                      <div key={meeting.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
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
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Priority Tasks
                </CardTitle>
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
                        <div key={task.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{task.name}</p>
                            <p className="text-xs text-muted-foreground">{task.category}</p>
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => completeTask(task.id)}>
                            <CheckCircle2 className="w-4 h-4" />
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
                <CardTitle className="text-base">Recent Messages</CardTitle>
              </CardHeader>
              <CardContent>
                {messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No messages yet</p>
                ) : (
                  <div className="space-y-3">
                    {messages.slice(0, 4).map((msg) => (
                      <div key={msg.id} className={cn("p-3 rounded-lg", msg.sender_type === "client" ? "bg-muted/50" : "bg-primary/5")}>
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
                        "flex items-center gap-3 p-3 rounded-lg border",
                        task.status === "completed" && "opacity-60"
                      )}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => task.status !== "completed" && completeTask(task.id)}
                        disabled={task.status === "completed"}
                      >
                        {task.status === "completed" ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : (
                          <Circle className="w-5 h-5" />
                        )}
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
                        <div>
                          <p className="font-medium">{d.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(d.submitted_at), "MMM d, yyyy")} • {d.category}
                          </p>
                        </div>
                        <Badge
                          variant={
                            d.status === "approved" ? "default" :
                            d.status === "pending_review" ? "secondary" : "outline"
                          }
                        >
                          {d.status.replace("_", " ")}
                        </Badge>
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
              <CardTitle>Messages</CardTitle>
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
                          "p-3 rounded-lg",
                          msg.sender_type === "client" ? "bg-muted/50" : "bg-primary/10 ml-8"
                        )}
                      >
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
              <CardTitle>Projects</CardTitle>
              <CardDescription>{projects.length} total projects</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] pr-4">
                {projects.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No projects yet</p>
                ) : (
                  <div className="space-y-3">
                    {projects.map((project) => (
                      <div key={project.id} className="p-4 rounded-lg border">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-medium">{project.name}</p>
                          <Badge
                            variant={project.status === "in_progress" ? "default" : "secondary"}
                          >
                            {project.status.replace("_", " ")}
                          </Badge>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${project.progress_percentage || 0}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {project.progress_percentage || 0}% complete
                        </p>
                      </div>
                    ))}
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
