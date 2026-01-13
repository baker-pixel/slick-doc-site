import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { format, differenceInHours, isToday, isTomorrow, isPast } from "date-fns";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  Timer,
  Zap,
  Filter,
  MoreVertical,
  Play,
  Pause,
  Square,
  ChevronRight,
  ChevronDown,
  Keyboard,
  Bot,
  FileText,
  FolderOpen,
  Calendar,
  Search,
  X,
  SkipForward,
  CheckCheck,
  Loader2,
  Sparkles,
  Lock,
  ArrowUp,
  ArrowDown
} from "lucide-react";
import { useTaskTimer } from "@/hooks/use-task-timer";
import { cn } from "@/lib/utils";

interface SmartTaskQueueProps {
  adminPassword: string;
}

interface TaskWithContext {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  notes: string | null;
  category: string;
  status: string;
  priority: string;
  automation_type: string;
  created_at: string;
  due_date: string | null;
  completed_at: string | null;
  started_at: string | null;
  time_spent_minutes: number;
  timer_started_at: string | null;
  depends_on: string[] | null;
  blocked_reason: string | null;
  order_index: number;
  client_accounts: {
    id: string;
    business_name: string;
    tier: string;
  };
  slaStatus: 'on_track' | 'warning' | 'breached';
  hoursRemaining: number;
  isBlocked: boolean;
  blockerNames: string[];
}

type QuickFilter = 'all' | 'today' | 'overdue' | 'blocked' | 'ready';

const KEYBOARD_SHORTCUTS = [
  { key: 'C', action: 'Complete task', description: 'Mark current task as complete' },
  { key: 'N', action: 'Next task', description: 'Move to next task in queue' },
  { key: 'P', action: 'Previous task', description: 'Move to previous task' },
  { key: 'S', action: 'Skip task', description: 'Skip to next available task' },
  { key: 'T', action: 'Toggle timer', description: 'Start/pause task timer' },
  { key: 'A', action: 'AI assist', description: 'Get AI assistance for task' },
  { key: 'Space', action: 'Expand/collapse', description: 'Toggle task details' },
  { key: '1-4', action: 'Quick filter', description: 'Switch between filter views' },
];

export function SmartTaskQueue({ adminPassword }: SmartTaskQueueProps) {
  const queryClient = useQueryClient();
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('ready');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [quickCompleteModal, setQuickCompleteModal] = useState<{ open: boolean; task: TaskWithContext | null }>({ open: false, task: null });
  const [completionNote, setCompletionNote] = useState('');
  const [isCompleting, setIsCompleting] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);

  // Tab state for queue vs completed view
  const [viewTab, setViewTab] = useState<'queue' | 'completed'>('queue');

  // Fetch all tasks with SLA data
  const { data: tasks = [], isLoading, refetch } = useQuery({
    queryKey: ["smart-task-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_tasks")
        .select(`
          *,
          client_accounts!inner (id, business_name, tier)
        `)
        .in("status", ["pending", "in_progress"])
        .order("order_index", { ascending: true });
      
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch completed tasks for today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const { data: completedTasks = [], isLoading: isLoadingCompleted, refetch: refetchCompleted } = useQuery({
    queryKey: ["completed-tasks-today"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_tasks")
        .select(`
          *,
          client_accounts!inner (id, business_name, tier)
        `)
        .eq("status", "completed")
        .gte("completed_at", todayStart.toISOString())
        .order("completed_at", { ascending: false });
      
      if (error) throw error;
      return data || [];
    }
  });

  // Group completed tasks by client
  const completedByClient = useMemo(() => {
    const grouped = new Map<string, { client: { id: string; business_name: string; tier: string }; tasks: typeof completedTasks }>();
    
    completedTasks.forEach(task => {
      const clientId = task.client_accounts?.id;
      if (!clientId) return;
      
      if (!grouped.has(clientId)) {
        grouped.set(clientId, {
          client: task.client_accounts,
          tasks: []
        });
      }
      grouped.get(clientId)!.tasks.push(task);
    });
    
    return Array.from(grouped.values());
  }, [completedTasks]);

  // Fetch SLA configurations
  const { data: slaConfigs = [] } = useQuery({
    queryKey: ["sla-configs-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sla_configurations")
        .select("*");
      if (error) throw error;
      return data || [];
    }
  });

  // Process tasks with SLA status and blocking info
  const processedTasks: TaskWithContext[] = useMemo(() => {
    return tasks.map(task => {
      const clientTier = task.client_accounts?.tier || "foundation";
      const slaConfig = slaConfigs.find(
        c => c.tier === clientTier && c.task_category === task.category
      );

      const targetHours = slaConfig?.target_hours || 48;
      const warningHours = slaConfig?.warning_hours || 24;
      
      const startTime = task.started_at ? new Date(task.started_at) : new Date(task.created_at);
      const hoursElapsed = differenceInHours(new Date(), startTime);
      const hoursRemaining = targetHours - hoursElapsed;

      let slaStatus: 'on_track' | 'warning' | 'breached' = 'on_track';
      if (hoursRemaining <= 0) {
        slaStatus = 'breached';
      } else if (hoursRemaining <= warningHours) {
        slaStatus = 'warning';
      }

      // Check dependencies
      const blockerNames: string[] = [];
      let isBlocked = false;
      if (task.depends_on && Array.isArray(task.depends_on) && task.depends_on.length > 0) {
        task.depends_on.forEach((depId: string) => {
          const depTask = tasks.find(t => t.id === depId);
          if (depTask && depTask.status !== 'completed') {
            isBlocked = true;
            blockerNames.push(depTask.name);
          }
        });
      }

      return {
        ...task,
        slaStatus,
        hoursRemaining,
        isBlocked,
        blockerNames,
        priority: task.priority || 'medium'
      };
    });
  }, [tasks, slaConfigs]);

  // Filter and sort tasks
  const filteredTasks = useMemo(() => {
    let filtered = processedTasks;

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        t.name.toLowerCase().includes(query) ||
        t.client_accounts?.business_name.toLowerCase().includes(query) ||
        t.category.toLowerCase().includes(query)
      );
    }

    // Apply quick filter
    switch (quickFilter) {
      case 'today':
        filtered = filtered.filter(t => 
          t.due_date && isToday(new Date(t.due_date))
        );
        break;
      case 'overdue':
        filtered = filtered.filter(t => t.slaStatus === 'breached');
        break;
      case 'blocked':
        filtered = filtered.filter(t => t.isBlocked);
        break;
      case 'ready':
        filtered = filtered.filter(t => !t.isBlocked);
        break;
    }

    // Smart sorting: Priority -> SLA status -> Hours remaining
    return filtered.sort((a, b) => {
      // Blocked tasks go to the end
      if (a.isBlocked && !b.isBlocked) return 1;
      if (!a.isBlocked && b.isBlocked) return -1;

      // Priority order
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      const priorityDiff = (priorityOrder[a.priority as keyof typeof priorityOrder] || 2) - 
                          (priorityOrder[b.priority as keyof typeof priorityOrder] || 2);
      if (priorityDiff !== 0) return priorityDiff;

      // SLA status order
      const slaOrder = { breached: 0, warning: 1, on_track: 2 };
      const slaDiff = slaOrder[a.slaStatus] - slaOrder[b.slaStatus];
      if (slaDiff !== 0) return slaDiff;

      // Hours remaining
      return a.hoursRemaining - b.hoursRemaining;
    });
  }, [processedTasks, searchQuery, quickFilter]);

  const currentTask = filteredTasks[currentTaskIndex];

  // Task timer for current task
  const taskTimer = useTaskTimer({
    taskId: currentTask?.id || '',
    initialMinutes: currentTask?.time_spent_minutes || 0
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key.toLowerCase()) {
        case 'c':
          if (currentTask && !currentTask.isBlocked) {
            setQuickCompleteModal({ open: true, task: currentTask });
          }
          break;
        case 'n':
          setCurrentTaskIndex(prev => Math.min(prev + 1, filteredTasks.length - 1));
          break;
        case 'p':
          setCurrentTaskIndex(prev => Math.max(prev - 1, 0));
          break;
        case 's':
          // Skip to next non-blocked task
          const nextReady = filteredTasks.findIndex((t, i) => i > currentTaskIndex && !t.isBlocked);
          if (nextReady >= 0) setCurrentTaskIndex(nextReady);
          break;
        case 't':
          if (currentTask) {
            if (taskTimer.isRunning) {
              taskTimer.pause();
            } else {
              taskTimer.start();
            }
          }
          break;
        case 'a':
          // AI assist - to be implemented
          toast.info('AI assistance coming soon!');
          break;
        case ' ':
          e.preventDefault();
          setExpandedTaskId(prev => prev === currentTask?.id ? null : currentTask?.id || null);
          break;
        case '1':
          setQuickFilter('all');
          break;
        case '2':
          setQuickFilter('ready');
          break;
        case '3':
          setQuickFilter('today');
          break;
        case '4':
          setQuickFilter('overdue');
          break;
        case '?':
          setShowKeyboardHelp(true);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTask, currentTaskIndex, filteredTasks, taskTimer]);

  // Complete task handler
  const completeTask = async (task: TaskWithContext, note?: string) => {
    setIsCompleting(true);
    try {
      await taskTimer.stop();
      
      const { error } = await supabase
        .from('client_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          notes: note || task.notes,
          time_spent_minutes: taskTimer.elapsedMinutes
        })
        .eq('id', task.id);

      if (error) throw error;

      toast.success(`Completed: ${task.name}`);
      setQuickCompleteModal({ open: false, task: null });
      setCompletionNote('');
      refetch();
      refetchCompleted();

      // Auto-advance to next task
      if (currentTaskIndex < filteredTasks.length - 1) {
        setCurrentTaskIndex(prev => prev);
      }
    } catch (error) {
      console.error('Error completing task:', error);
      toast.error('Failed to complete task');
    } finally {
      setIsCompleting(false);
    }
  };

  // Bulk operations
  const handleBulkComplete = async () => {
    if (selectedTasks.size === 0) return;
    
    setIsCompleting(true);
    try {
      const { error } = await supabase
        .from('client_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .in('id', Array.from(selectedTasks));

      if (error) throw error;

      toast.success(`Completed ${selectedTasks.size} tasks`);
      setSelectedTasks(new Set());
      refetch();
      refetchCompleted();
    } catch (error) {
      console.error('Error bulk completing:', error);
      toast.error('Failed to complete tasks');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleBulkPrioritize = async (priority: string) => {
    if (selectedTasks.size === 0) return;
    
    try {
      const { error } = await supabase
        .from('client_tasks')
        .update({ priority })
        .in('id', Array.from(selectedTasks));

      if (error) throw error;

      toast.success(`Updated ${selectedTasks.size} tasks to ${priority} priority`);
      setSelectedTasks(new Set());
      refetch();
    } catch (error) {
      console.error('Error updating priority:', error);
      toast.error('Failed to update priority');
    }
  };

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedTasks(new Set(filteredTasks.map(t => t.id)));
  };

  const clearSelection = () => {
    setSelectedTasks(new Set());
  };

  const getSlaColor = (status: string) => {
    switch (status) {
      case 'breached': return 'text-red-500 bg-red-500/10';
      case 'warning': return 'text-yellow-500 bg-yellow-500/10';
      default: return 'text-green-500 bg-green-500/10';
    }
  };

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      urgent: 'bg-red-500/10 text-red-500 border-red-500/20',
      high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      medium: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      low: 'bg-muted text-muted-foreground'
    };
    return <Badge className={colors[priority] || colors.medium}>{priority}</Badge>;
  };

  // Stats
  const stats = {
    total: filteredTasks.length,
    ready: filteredTasks.filter(t => !t.isBlocked).length,
    blocked: filteredTasks.filter(t => t.isBlocked).length,
    overdue: filteredTasks.filter(t => t.slaStatus === 'breached').length,
    todayDue: filteredTasks.filter(t => t.due_date && isToday(new Date(t.due_date))).length
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Smart Task Queue</h2>
          <p className="text-muted-foreground">
            {stats.ready} tasks ready • {stats.overdue > 0 && <span className="text-red-500">{stats.overdue} overdue</span>}
            {stats.todayDue > 0 && <span className="text-yellow-500 ml-2">{stats.todayDue} due today</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex items-center bg-muted rounded-lg p-1">
            <Button 
              variant={viewTab === 'queue' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => setViewTab('queue')}
            >
              <Zap className="h-4 w-4 mr-1" />
              Queue
            </Button>
            <Button 
              variant={viewTab === 'completed' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => setViewTab('completed')}
              className="flex items-center gap-1"
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Completed ({completedTasks.length})
            </Button>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => setShowKeyboardHelp(true)}>
                  <Keyboard className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Keyboard shortcuts (?)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Queue View */}
      {viewTab === 'queue' && (
        <>
          {/* Quick Filters */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
              <Button 
                variant={quickFilter === 'all' ? 'default' : 'ghost'} 
                size="sm"
                onClick={() => setQuickFilter('all')}
              >
                All ({processedTasks.length})
              </Button>
              <Button 
                variant={quickFilter === 'ready' ? 'default' : 'ghost'} 
                size="sm"
                onClick={() => setQuickFilter('ready')}
              >
                Ready ({stats.ready})
              </Button>
              <Button 
                variant={quickFilter === 'today' ? 'default' : 'ghost'} 
                size="sm"
                onClick={() => setQuickFilter('today')}
              >
                Due Today
              </Button>
              <Button 
                variant={quickFilter === 'overdue' ? 'default' : 'ghost'} 
                size="sm"
                onClick={() => setQuickFilter('overdue')}
                className={stats.overdue > 0 ? 'text-red-500' : ''}
              >
                Overdue ({stats.overdue})
              </Button>
              <Button 
                variant={quickFilter === 'blocked' ? 'default' : 'ghost'} 
                size="sm"
                onClick={() => setQuickFilter('blocked')}
              >
                Blocked ({stats.blocked})
              </Button>
            </div>

            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Bulk Actions Bar */}
          {selectedTasks.size > 0 && (
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-medium">{selectedTasks.size} selected</span>
                  <Button variant="ghost" size="sm" onClick={clearSelection}>Clear</Button>
                  <Button variant="ghost" size="sm" onClick={selectAllVisible}>Select all visible</Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    size="sm" 
                    onClick={handleBulkComplete}
                    disabled={isCompleting}
                  >
                    <CheckCheck className="h-4 w-4 mr-1" />
                    Complete All
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        Set Priority
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => handleBulkPrioritize('urgent')}>
                        <ArrowUp className="h-4 w-4 mr-2 text-red-500" /> Urgent
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleBulkPrioritize('high')}>
                        <ArrowUp className="h-4 w-4 mr-2 text-orange-500" /> High
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleBulkPrioritize('medium')}>
                        Medium
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleBulkPrioritize('low')}>
                        <ArrowDown className="h-4 w-4 mr-2 text-muted-foreground" /> Low
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Main Content */}
          <div className="grid grid-cols-3 gap-6">
            {/* Task List */}
            <div className="col-span-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    Task Queue
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[600px]">
                    <div className="divide-y">
                      {filteredTasks.map((task, index) => (
                        <div
                          key={task.id}
                          className={cn(
                            "p-4 hover:bg-muted/50 cursor-pointer transition-colors",
                            currentTaskIndex === index && "bg-primary/5 border-l-4 border-l-primary",
                            task.isBlocked && "opacity-60"
                          )}
                          onClick={() => setCurrentTaskIndex(index)}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={selectedTasks.has(task.id)}
                              onCheckedChange={() => toggleTaskSelection(task.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                {task.isBlocked ? (
                                  <Lock className="h-4 w-4 text-orange-500 shrink-0" />
                                ) : task.status === 'in_progress' ? (
                                  <Clock className="h-4 w-4 text-blue-500 shrink-0" />
                                ) : (
                                  <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                                )}
                                <span className="font-medium truncate">{task.name}</span>
                                {getPriorityBadge(task.priority)}
                              </div>
                              
                              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                <span>{task.client_accounts?.business_name}</span>
                                <span>•</span>
                                <span>{task.category}</span>
                                {task.time_spent_minutes > 0 && (
                                  <>
                                    <span>•</span>
                                    <span className="flex items-center gap-1">
                                      <Timer className="h-3 w-3" />
                                      {Math.floor(task.time_spent_minutes / 60)}h {task.time_spent_minutes % 60}m
                                    </span>
                                  </>
                                )}
                              </div>

                              {task.isBlocked && task.blockerNames.length > 0 && (
                                <div className="mt-2 text-xs text-orange-500">
                                  Blocked by: {task.blockerNames.join(', ')}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <Badge className={getSlaColor(task.slaStatus)}>
                                {task.hoursRemaining < 0 
                                  ? `${Math.abs(Math.round(task.hoursRemaining))}h overdue`
                                  : task.hoursRemaining < 24 
                                    ? `${Math.round(task.hoursRemaining)}h left`
                                    : `${Math.round(task.hoursRemaining / 24)}d left`
                                }
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      {filteredTasks.length === 0 && (
                        <div className="p-8 text-center text-muted-foreground">
                          <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
                          <p>No tasks matching this filter!</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* Task Details Panel */}
            <div className="space-y-4">
              {currentTask ? (
                <>
                  {/* Current Task Card */}
                  <Card className="border-2 border-primary/20">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">Current Task</Badge>
                        <span className="text-sm text-muted-foreground">
                          {currentTaskIndex + 1} of {filteredTasks.length}
                        </span>
                      </div>
                      <CardTitle className="text-lg">{currentTask.name}</CardTitle>
                      <CardDescription>{currentTask.client_accounts?.business_name}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Timer */}
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex items-center gap-3">
                          <Timer className="h-5 w-5 text-primary" />
                          <span className="text-2xl font-mono font-bold">{taskTimer.formattedTime}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {taskTimer.isRunning ? (
                            <Button size="sm" variant="outline" onClick={taskTimer.pause}>
                              <Pause className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button size="sm" onClick={taskTimer.start}>
                              <Play className="h-4 w-4" />
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={taskTimer.stop}>
                            <Square className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Instructions */}
                      {currentTask.instructions && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <FileText className="h-4 w-4" />
                            SOP Instructions
                          </div>
                          <div className="p-3 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap">
                            {currentTask.instructions}
                          </div>
                        </div>
                      )}

                      {/* Description */}
                      {currentTask.description && (
                        <div className="space-y-2">
                          <div className="text-sm font-medium">Description</div>
                          <p className="text-sm text-muted-foreground">{currentTask.description}</p>
                        </div>
                      )}

                      {/* Quick Actions */}
                      <div className="grid grid-cols-2 gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="w-full"
                        >
                          <FolderOpen className="h-4 w-4 mr-2" />
                          Assets
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="w-full"
                          onClick={() => toast.info('AI assistance coming soon!')}
                        >
                          <Sparkles className="h-4 w-4 mr-2" />
                          AI Assist
                        </Button>
                      </div>

                      {/* Action Buttons */}
                      <div className="space-y-2 pt-2">
                        <Button 
                          className="w-full"
                          disabled={currentTask.isBlocked || isCompleting}
                          onClick={() => setQuickCompleteModal({ open: true, task: currentTask })}
                        >
                          {isCompleting ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                          )}
                          Complete Task (C)
                        </Button>
                        <Button 
                          variant="outline" 
                          className="w-full"
                          onClick={() => {
                            const nextReady = filteredTasks.findIndex((t, i) => i > currentTaskIndex && !t.isBlocked);
                            if (nextReady >= 0) setCurrentTaskIndex(nextReady);
                          }}
                        >
                          <SkipForward className="h-4 w-4 mr-2" />
                          Skip to Next (S)
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Navigation */}
                  <div className="flex items-center justify-between">
                    <Button 
                      variant="outline" 
                      size="sm"
                      disabled={currentTaskIndex === 0}
                      onClick={() => setCurrentTaskIndex(prev => prev - 1)}
                    >
                      ← Previous (P)
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      disabled={currentTaskIndex >= filteredTasks.length - 1}
                      onClick={() => setCurrentTaskIndex(prev => prev + 1)}
                    >
                      Next (N) →
                    </Button>
                  </div>
                </>
              ) : (
                <Card className="p-8 text-center">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <p className="font-medium">All caught up!</p>
                  <p className="text-sm text-muted-foreground">No tasks in the current filter</p>
                </Card>
              )}
            </div>
          </div>
        </>
      )}

      {/* Completed Today View */}
      {viewTab === 'completed' && (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{completedTasks.length}</p>
                  <p className="text-sm text-muted-foreground">Completed Today</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Timer className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {Math.floor(completedTasks.reduce((acc, t) => acc + (t.time_spent_minutes || 0), 0) / 60)}h {completedTasks.reduce((acc, t) => acc + (t.time_spent_minutes || 0), 0) % 60}m
                  </p>
                  <p className="text-sm text-muted-foreground">Time Logged</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <FolderOpen className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{completedByClient.length}</p>
                  <p className="text-sm text-muted-foreground">Clients Served</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/10 rounded-lg">
                  <Zap className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.ready}</p>
                  <p className="text-sm text-muted-foreground">Tasks Remaining</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Completed Tasks by Client */}
          {isLoadingCompleted ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : completedByClient.length === 0 ? (
            <Card className="p-12 text-center">
              <Circle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="font-medium text-lg">No tasks completed today yet</p>
              <p className="text-muted-foreground mt-1">Tasks you complete will appear here as a checklist</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => setViewTab('queue')}
              >
                Go to Task Queue
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {completedByClient.map(({ client, tasks: clientTasks }) => (
                <Card key={client.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <CheckCircle2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{client.business_name}</CardTitle>
                          <CardDescription>
                            {clientTasks.length} task{clientTasks.length !== 1 ? 's' : ''} completed
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant="outline" className="capitalize">{client.tier}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {clientTasks.map((task) => (
                        <div 
                          key={task.id} 
                          className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
                        >
                          <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{task.name}</p>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              <span>{task.category}</span>
                              {task.time_spent_minutes > 0 && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <Timer className="h-3 w-3" />
                                    {Math.floor(task.time_spent_minutes / 60)}h {task.time_spent_minutes % 60}m
                                  </span>
                                </>
                              )}
                              {task.completed_at && (
                                <>
                                  <span>•</span>
                                  <span>
                                    {format(new Date(task.completed_at), 'h:mm a')}
                                  </span>
                                </>
                              )}
                            </div>
                            {task.notes && (
                              <p className="text-sm text-muted-foreground mt-1 italic">
                                "{task.notes}"
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick Complete Modal */}
      <Dialog open={quickCompleteModal.open} onOpenChange={(open) => setQuickCompleteModal({ open, task: quickCompleteModal.task })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Task</DialogTitle>
            <DialogDescription>
              {quickCompleteModal.task?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between text-sm">
              <span>Time tracked:</span>
              <span className="font-mono font-bold">{taskTimer.formattedTime}</span>
            </div>
            <Textarea
              placeholder="Add completion notes (optional)..."
              value={completionNote}
              onChange={(e) => setCompletionNote(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickCompleteModal({ open: false, task: null })}>
              Cancel
            </Button>
            <Button 
              onClick={() => quickCompleteModal.task && completeTask(quickCompleteModal.task, completionNote)}
              disabled={isCompleting}
            >
              {isCompleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Complete & Next
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Keyboard Shortcuts Modal */}
      <Dialog open={showKeyboardHelp} onOpenChange={setShowKeyboardHelp}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5" />
              Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>
          <div className="divide-y">
            {KEYBOARD_SHORTCUTS.map((shortcut) => (
              <div key={shortcut.key} className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">{shortcut.action}</p>
                  <p className="text-sm text-muted-foreground">{shortcut.description}</p>
                </div>
                <kbd className="px-2 py-1 bg-muted rounded text-sm font-mono">{shortcut.key}</kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
