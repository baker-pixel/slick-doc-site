import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import {
  Users,
  UserPlus,
  ArrowRight,
  GripVertical,
  Clock,
  Building2,
  CheckCircle2,
  AlertTriangle
} from "lucide-react";
import { callAdminApi } from "@/lib/admin-api";

interface TeamAssignmentBoardProps {
  adminPassword: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  photo_url?: string | null;
  is_active: boolean;
}

interface ClientTask {
  id: string;
  name: string;
  status: string;
  category: string;
  due_date: string | null;
  assigned_to: string | null;
  client_account_id: string;
  automation_type: string;
  client_accounts?: {
    business_name: string;
  };
}

const statusColumns = [
  { id: "pending", label: "Pending", color: "bg-orange-100" },
  { id: "in_progress", label: "In Progress", color: "bg-blue-100" },
  { id: "review", label: "In Review", color: "bg-purple-100" },
  { id: "completed", label: "Completed", color: "bg-green-100" }
];

export function TeamAssignmentBoard({ adminPassword }: TeamAssignmentBoardProps) {
  const [selectedTeamMember, setSelectedTeamMember] = useState<string | "all">("all");
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [newMember, setNewMember] = useState({ name: "", email: "", role: "team_member" });
  const queryClient = useQueryClient();

  // Fetch team members
  const { data: teamMembers = [] } = useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data || []).map((m: any) => ({ ...m, photo_url: m.photo_url })) as TeamMember[];
    }
  });

  // Fetch all tasks with client info
  const { data: allTasks = [] } = useQuery({
    queryKey: ["team-assignment-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_tasks")
        .select(`
          *,
          client_accounts (business_name)
        `)
        .neq("status", "completed")
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || []) as ClientTask[];
    }
  });

  // Add team member mutation
  const addMemberMutation = useMutation({
    mutationFn: async (member: typeof newMember) => {
      const { error } = await callAdminApi(adminPassword, { action: "create", table: "team_members", data: member });
      if (error) throw new Error(error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      setAddMemberOpen(false);
      setNewMember({ name: "", email: "", role: "team_member" });
      toast.success("Team member added!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to add team member");
    }
  });

  // Update task assignment mutation
  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, assignedTo, status }: { taskId: string; assignedTo?: string; status?: string }) => {
      const updates: any = {};
      if (assignedTo !== undefined) updates.assigned_to = assignedTo || null;
      if (status) updates.status = status;
      
      const { error } = await supabase
        .from("client_tasks")
        .update(updates)
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-assignment-tasks"] });
      toast.success("Task updated!");
    }
  });

  // Filter tasks by team member
  const filteredTasks = useMemo(() => {
    if (selectedTeamMember === "all") return allTasks;
    if (selectedTeamMember === "unassigned") return allTasks.filter(t => !t.assigned_to);
    const member = teamMembers.find(m => m.id === selectedTeamMember);
    return allTasks.filter(t => t.assigned_to === member?.name);
  }, [allTasks, selectedTeamMember, teamMembers]);

  // Get tasks by status
  const tasksByStatus = useMemo(() => {
    const grouped: Record<string, ClientTask[]> = {};
    statusColumns.forEach(col => {
      grouped[col.id] = filteredTasks.filter(t => t.status === col.id);
    });
    return grouped;
  }, [filteredTasks]);

  // Calculate workload per member
  const workloadByMember = useMemo(() => {
    const workload: Record<string, number> = {};
    teamMembers.forEach(m => { workload[m.id] = 0; });
    allTasks.forEach(t => {
      const member = teamMembers.find(m => m.name === t.assigned_to);
      if (member && workload[member.id] !== undefined) {
        workload[member.id]++;
      }
    });
    return workload;
  }, [teamMembers, allTasks]);

  const unassignedCount = allTasks.filter(t => !t.assigned_to).length;

  const getMemberById = (id: string) => teamMembers.find(m => m.id === id);

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData("taskId", taskId);
  };

  const handleDrop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("taskId");
    if (taskId) {
      updateTaskMutation.mutate({ taskId, status });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Team Assignment Board</h2>
          <p className="text-muted-foreground">
            Drag and drop tasks to reassign or update status
          </p>
        </div>
        <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Team Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Team Member</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={newMember.name}
                  onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                  placeholder="John Doe"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={newMember.email}
                  onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <Label>Role</Label>
                <Select
                  value={newMember.role}
                  onValueChange={(value) => setNewMember({ ...newMember, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="team_member">Team Member</SelectItem>
                    <SelectItem value="team_lead">Team Lead</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                onClick={() => addMemberMutation.mutate(newMember)}
                disabled={!newMember.name || !newMember.email || addMemberMutation.isPending}
              >
                Add Member
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Team Member Filter */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-4 overflow-x-auto pb-2">
            <Button
              variant={selectedTeamMember === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedTeamMember("all")}
            >
              <Users className="h-4 w-4 mr-2" />
              All Tasks ({allTasks.length})
            </Button>
            <Button
              variant={selectedTeamMember === "unassigned" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedTeamMember("unassigned")}
              className={unassignedCount > 0 ? "border-orange-300" : ""}
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Unassigned ({unassignedCount})
            </Button>
            {teamMembers.map(member => (
              <Button
                key={member.id}
                variant={selectedTeamMember === member.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedTeamMember(member.id)}
                className="flex items-center gap-2"
              >
                <Avatar className="h-5 w-5">
                  <AvatarImage src={member.photo_url || undefined} />
                  <AvatarFallback className="text-xs">
                    {member.name.split(" ").map(n => n[0]).join("")}
                  </AvatarFallback>
                </Avatar>
                <span>{member.name}</span>
                <Badge variant="secondary" className="ml-1">
                  {workloadByMember[member.id] || 0}
                </Badge>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Kanban Board */}
      <div className="grid grid-cols-4 gap-4">
        {statusColumns.map(column => (
          <div key={column.id} className="space-y-3">
            <div className={`p-3 rounded-lg ${column.color}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{column.label}</h3>
                <Badge variant="secondary">{tasksByStatus[column.id]?.length || 0}</Badge>
              </div>
            </div>
            
            <div
              className="min-h-[500px] bg-muted/30 rounded-lg p-2 space-y-2"
              onDrop={(e) => handleDrop(e, column.id)}
              onDragOver={handleDragOver}
            >
              {tasksByStatus[column.id]?.map(task => {
                const assignedMember = task.assigned_to ? teamMembers.find(m => m.name === task.assigned_to) : null;
                const isOverdue = task.due_date && new Date(task.due_date) < new Date();
                
                return (
                  <Card
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    className={`cursor-grab hover:shadow-md transition-shadow ${isOverdue ? "border-red-300" : ""}`}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between mb-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                        <Select
                          value={task.assigned_to || "unassigned"}
                          onValueChange={(value) => 
                            updateTaskMutation.mutate({ 
                              taskId: task.id, 
                              assignedTo: value === "unassigned" ? "" : value 
                            })
                          }
                        >
                          <SelectTrigger className="h-7 w-[120px] text-xs">
                            <SelectValue placeholder="Assign" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {teamMembers.map(m => (
                              <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="font-medium text-sm mb-1">{task.name}</div>
                      
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                        <Building2 className="h-3 w-3" />
                        <span className="truncate">{task.client_accounts?.business_name}</span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs">{task.category}</Badge>
                        {task.due_date && (
                          <div className={`flex items-center gap-1 text-xs ${isOverdue ? "text-red-500" : "text-muted-foreground"}`}>
                            <Clock className="h-3 w-3" />
                            {format(new Date(task.due_date), "MMM d")}
                          </div>
                        )}
                      </div>
                      
                      {assignedMember && (
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                          <Avatar className="h-5 w-5">
                            <AvatarImage src={assignedMember.photo_url || undefined} />
                            <AvatarFallback className="text-xs">
                              {assignedMember.name.split(" ").map(n => n[0]).join("")}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-muted-foreground">{assignedMember.name}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}