import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  CheckSquare,
  Square,
  Trash2,
  UserPlus,
  Send,
  RefreshCw,
  Filter,
  Building2,
  Clock,
  AlertTriangle
} from "lucide-react";

interface BatchOperationsPanelProps {
  adminPassword: string;
}

interface ClientTask {
  id: string;
  name: string;
  status: string;
  category: string;
  due_date: string | null;
  client_account_id: string;
  assigned_to: string | null;
  client_accounts?: {
    business_name: string;
  };
}

export function BatchOperationsPanel({ adminPassword }: BatchOperationsPanelProps) {
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterClient, setFilterClient] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();

  // Fetch tasks
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["batch-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_tasks")
        .select(`
          *,
          client_accounts (business_name)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ClientTask[];
    }
  });

  // Fetch clients for filter
  const { data: clients = [] } = useQuery({
    queryKey: ["batch-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_accounts")
        .select("id, business_name")
        .order("business_name");
      if (error) throw error;
      return data;
    }
  });

  // Fetch team members
  const { data: teamMembers = [] } = useQuery({
    queryKey: ["batch-team-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("id, name")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    }
  });

  // Batch update mutation
  const batchUpdateMutation = useMutation({
    mutationFn: async ({ taskIds, updates }: { taskIds: string[]; updates: any }) => {
      const { error } = await supabase
        .from("client_tasks")
        .update(updates)
        .in("id", taskIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batch-tasks"] });
      setSelectedTasks(new Set());
      toast.success("Tasks updated successfully!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update tasks");
    }
  });

  // Batch delete mutation
  const batchDeleteMutation = useMutation({
    mutationFn: async (taskIds: string[]) => {
      const { error } = await supabase
        .from("client_tasks")
        .delete()
        .in("id", taskIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batch-tasks"] });
      setSelectedTasks(new Set());
      toast.success("Tasks deleted successfully!");
    }
  });

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (filterStatus !== "all" && task.status !== filterStatus) return false;
      if (filterClient !== "all" && task.client_account_id !== filterClient) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!task.name.toLowerCase().includes(query) &&
            !task.client_accounts?.business_name.toLowerCase().includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [tasks, filterStatus, filterClient, searchQuery]);

  const toggleTask = (taskId: string) => {
    const newSelected = new Set(selectedTasks);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedTasks(newSelected);
  };

  const selectAll = () => {
    if (selectedTasks.size === filteredTasks.length) {
      setSelectedTasks(new Set());
    } else {
      setSelectedTasks(new Set(filteredTasks.map(t => t.id)));
    }
  };

  const handleBatchStatusUpdate = (status: string) => {
    const taskIds = Array.from(selectedTasks);
    const updates: any = { status };
    if (status === "completed") {
      updates.completed_at = new Date().toISOString();
      updates.completed_by = "Admin (Batch)";
    }
    batchUpdateMutation.mutate({ taskIds, updates });
  };

  const handleBatchAssign = (memberName: string) => {
    const taskIds = Array.from(selectedTasks);
    batchUpdateMutation.mutate({ 
      taskIds, 
      updates: { assigned_to: memberName || null } 
    });
  };

  const handleBatchDelete = () => {
    if (confirm(`Are you sure you want to delete ${selectedTasks.size} tasks?`)) {
      batchDeleteMutation.mutate(Array.from(selectedTasks));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-green-100 text-green-800";
      case "in_progress": return "bg-blue-100 text-blue-800";
      case "pending": return "bg-orange-100 text-orange-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Batch Operations</h2>
          <p className="text-muted-foreground">
            Select multiple tasks and perform bulk actions
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => queryClient.invalidateQueries({ queryKey: ["batch-tasks"] })}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clients</SelectItem>
                {clients.map(client => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.business_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* Batch Actions */}
      {selectedTasks.size > 0 && (
        <Card className="border-primary">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-primary" />
                <span className="font-medium">{selectedTasks.size} tasks selected</span>
              </div>
              <div className="flex items-center gap-2">
                <Select onValueChange={handleBatchStatusUpdate}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Set Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
                <Select onValueChange={(val) => handleBatchAssign(val === "__unassign__" ? "" : val)}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Assign To" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassign__">Unassign</SelectItem>
                    {teamMembers.map(member => (
                      <SelectItem key={member.id} value={member.name}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBatchDelete}
                  disabled={batchDeleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Task List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Tasks ({filteredTasks.length})</CardTitle>
            <Button variant="outline" size="sm" onClick={selectAll}>
              {selectedTasks.size === filteredTasks.length ? (
                <>
                  <Square className="h-4 w-4 mr-2" />
                  Deselect All
                </>
              ) : (
                <>
                  <CheckSquare className="h-4 w-4 mr-2" />
                  Select All
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <div className="space-y-2">
              {filteredTasks.map(task => {
                const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== "completed";
                return (
                  <div
                    key={task.id}
                    className={`flex items-center gap-4 p-3 border rounded-lg hover:bg-muted/50 transition-colors ${
                      selectedTasks.has(task.id) ? "bg-primary/5 border-primary" : ""
                    } ${isOverdue ? "border-red-300" : ""}`}
                  >
                    <Checkbox
                      checked={selectedTasks.has(task.id)}
                      onCheckedChange={() => toggleTask(task.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{task.name}</span>
                        {isOverdue && <AlertTriangle className="h-4 w-4 text-red-500" />}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Building2 className="h-3 w-3" />
                        <span>{task.client_accounts?.business_name}</span>
                        {task.due_date && (
                          <>
                            <Clock className="h-3 w-3 ml-2" />
                            <span className={isOverdue ? "text-red-500" : ""}>
                              {format(new Date(task.due_date), "MMM d, yyyy")}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <Badge variant="secondary" className={getStatusColor(task.status)}>
                      {task.status}
                    </Badge>
                    <Badge variant="outline">{task.category}</Badge>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}