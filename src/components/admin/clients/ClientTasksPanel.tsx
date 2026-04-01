import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, CheckCircle, Play, Eye, ClipboardList, Zap, User, Clock, RefreshCw, LayoutGrid, List } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { TaskCompletionModal } from "../workflow/TaskCompletionModal";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ClientTask {
  id: string;
  client_account_id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  category: string;
  automation_type: string;
  status: string;
  assigned_to: string | null;
  due_date: string | null;
  completed_at: string | null;
  notes: string | null;
  output_data: Record<string, unknown> | null;
  created_at: string;
  order_index?: number;
  client_accounts?: {
    business_name: string;
    tier: string;
  };
}

export function ClientTasksPanel({ adminPassword, clientId }: { adminPassword: string; clientId?: string }) {
  const [tasks, setTasks] = useState<ClientTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientFilter, setClientFilter] = useState(clientId || "all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [automationFilter, setAutomationFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [selectedTask, setSelectedTask] = useState<ClientTask | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [completionModalOpen, setCompletionModalOpen] = useState(false);
  const [taskToComplete, setTaskToComplete] = useState<ClientTask | null>(null);
  const [runningTasks, setRunningTasks] = useState<Set<string>>(new Set());
  const [runningAll, setRunningAll] = useState(false);
  const [clients, setClients] = useState<{ id: string; business_name: string }[]>([]);

  useEffect(() => {
    fetchTasks();
    fetchClients();
  }, []);

  useEffect(() => {
    // If we navigated here from the Home page, open the task details automatically.
    const taskId = (() => {
      try {
        return sessionStorage.getItem("admin:selectedTaskId");
      } catch {
        return null;
      }
    })();

    if (!taskId) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    setSelectedTask(task);
    setDetailsOpen(true);

    try {
      sessionStorage.removeItem("admin:selectedTaskId");
    } catch {
      // ignore
    }
  }, [tasks]);

  const fetchTasks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("client_tasks")
      .select(`
        *,
        client_accounts (
          business_name,
          tier
        )
      `)
      .order("order_index", { ascending: true })
      .limit(200);

    if (error) {
      toast.error("Failed to fetch tasks");
      console.error(error);
    } else {
      setTasks((data || []) as ClientTask[]);
    }
    setLoading(false);
  };

  const fetchClients = async () => {
    const { data } = await supabase
      .from("client_accounts")
      .select("id, business_name")
      .order("business_name");
    setClients(data || []);
  };

  const updateTaskStatus = async (taskId: string, status: string) => {
    const updates: Record<string, unknown> = { status };
    if (status === "completed") {
      updates.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("client_tasks")
      .update(updates)
      .eq("id", taskId);

    if (error) {
      toast.error("Failed to update task");
    } else {
      toast.success("Task updated");
      fetchTasks();
    }
  };

  const runAutomation = async (task: ClientTask) => {
    if (task.automation_type === "MANUAL") {
      toast.error("This task is not automatable");
      return;
    }

    setRunningTasks(prev => new Set([...prev, task.id]));

    try {
      const { runSingleTask } = await import("@/lib/n8n");
      const jobType = task.name.toLowerCase().replace(/\s+/g, "_");
      await runSingleTask(task.client_account_id, task.id, jobType);

      toast.success(`Task "${task.name}" completed`);
      fetchTasks();
    } catch (err) {
      toast.error(`Automation failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRunningTasks(prev => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  };

  const runAllPending = async () => {
    const pendingAutomatable = filteredTasks.filter(
      t => t.status === "pending" && t.automation_type === "FULL"
    );

    if (pendingAutomatable.length === 0) {
      toast.info("No pending FULL automation tasks to run");
      return;
    }

    setRunningAll(true);

    try {
      const { runAutoTasks } = await import("@/lib/n8n");
      const result = await runAutoTasks(pendingAutomatable[0].client_account_id);

      toast.success(`Completed ${result.completed}/${result.completed + result.failed} tasks`);
      fetchTasks();
    } catch (err) {
      toast.error(`Batch trigger failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRunningAll(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: "bg-yellow-500",
      in_progress: "bg-blue-500",
      completed: "bg-green-500",
      sent_to_client: "bg-purple-500",
      cancelled: "bg-gray-500",
    };
    return <Badge className={styles[status] || "bg-gray-500"}>{status.replace(/_/g, " ")}</Badge>;
  };

  const getAutomationIcon = (type: string) => {
    switch (type) {
      case "FULL": return <Zap className="h-4 w-4 text-green-500" />;
      case "SEMI": return <ClipboardList className="h-4 w-4 text-yellow-500" />;
      default: return <User className="h-4 w-4 text-gray-500" />;
    }
  };

  const filteredTasks = tasks.filter(t => {
    if (clientFilter !== "all" && t.client_account_id !== clientFilter) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (automationFilter !== "all" && t.automation_type !== automationFilter) return false;
    return true;
  });

  const doneStatuses = ["completed", "sent_to_client"];
  const stats = {
    total: filteredTasks.length,
    pending: filteredTasks.filter(t => t.status === "pending").length,
    completed: filteredTasks.filter(t => doneStatuses.includes(t.status)).length,
    automatable: filteredTasks.filter(t => t.automation_type !== "MANUAL" && t.status === "pending").length,
  };

  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Client Tasks
          </CardTitle>
          <div className="flex gap-2">
            {stats.automatable > 0 && (
              <Button 
                size="sm" 
                onClick={runAllPending}
                disabled={runningAll}
                className="bg-green-600 hover:bg-green-700"
              >
                {runningAll ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                Run All Pending ({stats.automatable})
              </Button>
            )}
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "table" | "kanban")} className="w-auto">
              <TabsList className="grid w-[140px] grid-cols-2">
                <TabsTrigger value="table" className="flex items-center gap-1">
                  <List className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="kanban" className="flex items-center gap-1">
                  <LayoutGrid className="h-4 w-4" />
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button size="sm" variant="outline" onClick={fetchTasks}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 mt-4">
          <Card className="p-3">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total Tasks</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-yellow-500">{stats.pending}</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-green-500">{stats.completed}</div>
            <div className="text-xs text-muted-foreground">Completed</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-blue-500">{stats.automatable}</div>
            <div className="text-xs text-muted-foreground">Ready to Automate</div>
          </Card>
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-sm mb-1">
            <span>Completion Rate</span>
            <span>{completionRate}%</span>
          </div>
          <Progress value={completionRate} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clients.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="sent_to_client">Sent to Client</SelectItem>
            </SelectContent>
          </Select>
          <Select value={automationFilter} onValueChange={setAutomationFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Automation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="FULL">FULL</SelectItem>
              <SelectItem value="SEMI">SEMI</SelectItem>
              <SelectItem value="MANUAL">MANUAL</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No tasks found. Tasks are automatically created when you add clients.
          </div>
        ) : viewMode === "kanban" ? (
          /* Kanban View */
          <div className="grid grid-cols-3 gap-4">
            {/* Pending Column */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b">
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <span className="font-semibold">Pending</span>
                <Badge variant="secondary">{filteredTasks.filter(t => t.status === "pending").length}</Badge>
              </div>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {filteredTasks.filter(t => t.status === "pending").slice(0, 20).map(task => (
                  <Card key={task.id} className="p-3 cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setSelectedTask(task); setDetailsOpen(true); }}>
                    <div className="font-medium text-sm line-clamp-2">{task.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{task.client_accounts?.business_name}</div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1">
                        {getAutomationIcon(task.automation_type)}
                        <span className="text-xs capitalize">{task.category}</span>
                      </div>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-green-600" onClick={(e) => { e.stopPropagation(); setTaskToComplete(task); setCompletionModalOpen(true); }}>
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
            
            {/* In Progress Column */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="font-semibold">In Progress</span>
                <Badge variant="secondary">{filteredTasks.filter(t => t.status === "in_progress").length}</Badge>
              </div>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {filteredTasks.filter(t => t.status === "in_progress").slice(0, 20).map(task => (
                  <Card key={task.id} className="p-3 cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setSelectedTask(task); setDetailsOpen(true); }}>
                    <div className="font-medium text-sm line-clamp-2">{task.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{task.client_accounts?.business_name}</div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1">
                        {getAutomationIcon(task.automation_type)}
                        <span className="text-xs capitalize">{task.category}</span>
                      </div>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-green-600" onClick={(e) => { e.stopPropagation(); setTaskToComplete(task); setCompletionModalOpen(true); }}>
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
            
            {/* Completed / Sent to Client Column */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="font-semibold">Done</span>
                <Badge variant="secondary">{filteredTasks.filter(t => doneStatuses.includes(t.status)).length}</Badge>
              </div>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {filteredTasks.filter(t => doneStatuses.includes(t.status)).slice(0, 20).map(task => (
                  <Card key={task.id} className="p-3 cursor-pointer hover:shadow-md transition-shadow opacity-75" onClick={() => { setSelectedTask(task); setDetailsOpen(true); }}>
                    <div className="font-medium text-sm line-clamp-2">{task.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{task.client_accounts?.business_name}</div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1">
                        {getAutomationIcon(task.automation_type)}
                        <span className="text-xs capitalize">{task.category}</span>
                      </div>
                      {task.automation_type !== "MANUAL" && (
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); runAutomation(task); }} disabled={runningTasks.has(task.id)} title="Re-run automation">
                          {runningTasks.has(task.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Table View */
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTasks.slice(0, 50).map((task) => (
                <TableRow key={task.id}>
                  <TableCell>
                    <div className="font-medium">{task.name}</div>
                    {task.description && (
                      <div className="text-xs text-muted-foreground line-clamp-1">{task.description}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{task.client_accounts?.business_name || "Unknown"}</div>
                    <div className="text-xs text-muted-foreground capitalize">{task.client_accounts?.tier}</div>
                  </TableCell>
                  <TableCell className="capitalize">{task.category}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {getAutomationIcon(task.automation_type)}
                      <span className="text-xs">{task.automation_type}</span>
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(task.status)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setSelectedTask(task); setDetailsOpen(true); }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {task.automation_type !== "MANUAL" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => runAutomation(task)}
                          disabled={runningTasks.has(task.id)}
                          title={task.status === "completed" ? "Re-run automation" : "Run automation"}
                        >
                          {runningTasks.has(task.id) ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      {!doneStatuses.includes(task.status) && task.status !== "in_progress" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-600 border-green-600 hover:bg-green-50"
                          onClick={() => { setTaskToComplete(task); setCompletionModalOpen(true); }}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg">{selectedTask?.name}</DialogTitle>
            </DialogHeader>
            {selectedTask && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Client</Label>
                    <p className="font-medium">{selectedTask.client_accounts?.business_name}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <div>{getStatusBadge(selectedTask.status)}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Category</Label>
                    <p className="capitalize">{selectedTask.category?.replace(/_/g, ' ')}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Automation Type</Label>
                    <p>{selectedTask.automation_type}</p>
                  </div>
                </div>
                {selectedTask.description && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Description</Label>
                    <p className="text-sm">{selectedTask.description}</p>
                  </div>
                )}
                {selectedTask.instructions && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Instructions</Label>
                    <p className="text-sm whitespace-pre-wrap">{selectedTask.instructions}</p>
                  </div>
                )}
                {selectedTask.output_data && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Automation Output</Label>
                    <pre className="text-xs bg-muted p-3 rounded overflow-x-auto overflow-y-auto max-h-60 whitespace-pre-wrap break-words">
                      {JSON.stringify(selectedTask.output_data, null, 2)}
                    </pre>
                  </div>
                )}
                <div className="flex gap-2 pt-4">
                  <Select
                    value={selectedTask.status}
                    onValueChange={(v) => updateTaskStatus(selectedTask.id, v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="sent_to_client">Sent to Client</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  {selectedTask.automation_type !== "MANUAL" && !doneStatuses.includes(selectedTask.status) && (
                    <Button onClick={() => runAutomation(selectedTask)} disabled={runningTasks.has(selectedTask.id)}>
                      {runningTasks.has(selectedTask.id) ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      Run Automation
                    </Button>
                  )}
                  {!doneStatuses.includes(selectedTask.status) && (
                    <Button 
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => { 
                        setTaskToComplete(selectedTask); 
                        setCompletionModalOpen(true); 
                        setDetailsOpen(false);
                      }}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Complete
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <TaskCompletionModal
          open={completionModalOpen}
          onOpenChange={setCompletionModalOpen}
          adminPassword={adminPassword}
          task={taskToComplete}
          onComplete={fetchTasks}
        />
      </CardContent>
    </Card>
  );
}