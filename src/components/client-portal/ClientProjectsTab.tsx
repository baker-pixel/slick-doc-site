import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, Calendar, Target, CheckCircle, Clock, ChevronDown, Circle,
  LayoutDashboard, Rocket, Flag, MessageCircle, Send, RefreshCw,
  HelpCircle, MessageSquare, Bell, AlertTriangle, FileDown, Paperclip
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { PageHeader, StatCard, ModernCard, EmptyState, StatusBadge } from "./PortalUI";
import { toast } from "sonner";

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  start_date: string | null;
  target_end_date: string | null;
  progress_percentage: number;
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

interface Comment {
  id: string;
  project_id: string;
  milestone_id: string | null;
  sender_type: string;
  sender_name: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface UpdateRequest {
  id: string;
  project_id: string;
  message: string | null;
  status: string;
  response: string | null;
  responded_at: string | null;
  created_at: string;
}

interface Deliverable {
  id: string;
  project_id: string | null;
  title: string;
  category: string | null;
  file_url: string | null;
  file_name: string | null;
  status: string;
  submitted_at: string | null;
}

interface ClientProjectsTabProps {
  clientAccountId: string;
}

const statusConfig: Record<string, { label: string; variant: "default" | "success" | "warning" | "error" | "info" }> = {
  completed: { label: "Completed", variant: "success" },
  in_progress: { label: "In Progress", variant: "info" },
  on_hold: { label: "On Hold", variant: "warning" },
  pending: { label: "Pending", variant: "default" },
};

export default function ClientProjectsTab({ clientAccountId }: ClientProjectsTabProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Record<string, Milestone[]>>({});
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [updateRequests, setUpdateRequests] = useState<Record<string, UpdateRequest[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [commentingMilestone, setCommentingMilestone] = useState<string | null>(null);
  const [commentingProject, setCommentingProject] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requestUpdateOpen, setRequestUpdateOpen] = useState(false);
  const [selectedProjectForUpdate, setSelectedProjectForUpdate] = useState<Project | null>(null);
  const [updateMessage, setUpdateMessage] = useState("");
  const [showComments, setShowComments] = useState<string | null>(null);
  const [deliverables, setDeliverables] = useState<Record<string, Deliverable[]>>({});
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    fetchProjects();

    const projectsChannel = supabase
      .channel('client-projects-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_projects', filter: `client_account_id=eq.${clientAccountId}` }, () => fetchProjects())
      .subscribe();

    const milestonesChannel = supabase
      .channel('project-milestones-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_milestones' }, () => fetchProjects())
      .subscribe();

    const commentsChannel = supabase
      .channel('project-comments-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_comments' }, () => fetchComments())
      .subscribe();

    return () => {
      supabase.removeChannel(projectsChannel);
      supabase.removeChannel(milestonesChannel);
      supabase.removeChannel(commentsChannel);
    };
  }, [clientAccountId]);

  const fetchProjects = async () => {
    try {
      const { data: projectsData, error } = await supabase
        .from("client_projects")
        .select("*")
        .eq("client_account_id", clientAccountId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setProjects(projectsData || []);

      const inProgressProject = projectsData?.find(p => p.status === 'in_progress');
      if (inProgressProject) setExpandedProject(inProgressProject.id);

      if (projectsData && projectsData.length > 0) {
        const projectIds = projectsData.map((p) => p.id);
        
        // Fetch milestones
        const { data: milestonesData } = await supabase
          .from("project_milestones")
          .select("*")
          .in("project_id", projectIds)
          .order("sort_order", { ascending: true });

        if (milestonesData) {
          const grouped = milestonesData.reduce((acc, m) => {
            if (!acc[m.project_id]) acc[m.project_id] = [];
            acc[m.project_id].push(m);
            return acc;
          }, {} as Record<string, Milestone[]>);
          setMilestones(grouped);
        }

        // Fetch update requests
        const { data: requestsData } = await supabase
          .from("project_update_requests")
          .select("*")
          .in("project_id", projectIds)
          .order("created_at", { ascending: false });

        if (requestsData) {
          const grouped = requestsData.reduce((acc, r) => {
            if (!acc[r.project_id]) acc[r.project_id] = [];
            acc[r.project_id].push(r);
            return acc;
          }, {} as Record<string, UpdateRequest[]>);
          setUpdateRequests(grouped);
        }

        await Promise.all([
          fetchComments(projectIds),
          fetchDeliverables(projectIds),
        ]);
      }
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDeliverables = async (projectIds: string[]) => {
    if (projectIds.length === 0) return;
    try {
      const { data } = await supabase
        .from("deliverables")
        .select("id, project_id, title, category, file_url, file_name, status, submitted_at")
        .in("project_id", projectIds)
        .order("submitted_at", { ascending: false });

      if (data) {
        const grouped = data.reduce((acc, d) => {
          if (!d.project_id) return acc;
          if (!acc[d.project_id]) acc[d.project_id] = [];
          acc[d.project_id].push(d);
          return acc;
        }, {} as Record<string, Deliverable[]>);
        setDeliverables(grouped);
      }
    } catch (error) {
      console.error("Error fetching deliverables:", error);
    }
  };

  const fetchComments = async (projectIds?: string[]) => {
    try {
      const ids = projectIds || projects.map(p => p.id);
      if (ids.length === 0) return;

      const { data: commentsData } = await supabase
        .from("project_comments")
        .select("*")
        .in("project_id", ids)
        .order("created_at", { ascending: true });

      if (commentsData) {
        const grouped = commentsData.reduce((acc, c) => {
          const key = c.milestone_id || c.project_id;
          if (!acc[key]) acc[key] = [];
          acc[key].push(c);
          return acc;
        }, {} as Record<string, Comment[]>);
        setComments(grouped);
      }
    } catch (error) {
      console.error("Error fetching comments:", error);
    }
  };

  const handleSubmitComment = async (projectId: string, milestoneId?: string) => {
    if (!newComment.trim()) return;
    setSubmitting(true);

    try {
      const { error } = await supabase
        .from("project_comments")
        .insert({
          project_id: projectId,
          milestone_id: milestoneId || null,
          client_account_id: clientAccountId,
          sender_type: "client",
          message: newComment.trim(),
        });

      if (error) throw error;

      toast.success("Question submitted! Your team will respond soon.");
      setNewComment("");
      setCommentingMilestone(null);
      setCommentingProject(null);
      await fetchComments();
    } catch (error) {
      console.error("Error submitting comment:", error);
      toast.error("Failed to submit question");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestUpdate = async () => {
    if (!selectedProjectForUpdate) return;
    setSubmitting(true);

    try {
      const { error } = await supabase
        .from("project_update_requests")
        .insert({
          project_id: selectedProjectForUpdate.id,
          client_account_id: clientAccountId,
          message: updateMessage.trim() || null,
        });

      if (error) throw error;

      toast.success("Update request sent! Your team will provide an update soon.");
      setUpdateMessage("");
      setRequestUpdateOpen(false);
      setSelectedProjectForUpdate(null);
      await fetchProjects();
    } catch (error) {
      console.error("Error requesting update:", error);
      toast.error("Failed to request update");
    } finally {
      setSubmitting(false);
    }
  };

  const getProgressGradient = (percentage: number) => {
    if (percentage === 100) return "from-emerald-500 to-green-400";
    if (percentage >= 50) return "from-blue-500 to-cyan-400";
    if (percentage > 0) return "from-amber-500 to-yellow-400";
    return "from-gray-400 to-gray-300";
  };

  const getMilestoneIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle className="h-5 w-5 text-emerald-500" />;
      case "in_progress": return <Clock className="h-5 w-5 text-blue-500" />;
      default: return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getMilestoneComments = (milestoneId: string) => {
    return comments[milestoneId] || [];
  };

  const getProjectComments = (projectId: string) => {
    return comments[projectId] || [];
  };

  const getProjectHealth = (project: Project, milestoneList: Milestone[]) => {
    if (project.status === 'completed' || project.status === 'pending') return null;
    const today = new Date();
    if (project.target_end_date && new Date(project.target_end_date) < today) {
      return { label: 'Delayed', cls: 'bg-red-100 text-red-700' };
    }
    const overdue = milestoneList.filter(
      m => m.due_date && new Date(m.due_date) < today && m.status !== 'completed'
    ).length;
    if (overdue === 0) return { label: 'On Track', cls: 'bg-emerald-100 text-emerald-700' };
    if (overdue <= 2) return { label: 'At Risk', cls: 'bg-amber-100 text-amber-700' };
    return { label: 'Delayed', cls: 'bg-red-100 text-red-700' };
  };

  const isMilestoneOverdue = (milestone: Milestone) => {
    if (!milestone.due_date || milestone.status === 'completed') return false;
    return new Date(milestone.due_date) < new Date();
  };

  const getDeliverableStatusVariant = (status: string): "default" | "success" | "warning" | "error" | "info" => {
    if (status === 'approved') return 'success';
    if (status === 'pending_review') return 'warning';
    if (status === 'revision_requested') return 'error';
    return 'default';
  };

  const getLatestUpdateRequest = (projectId: string) => {
    const requests = updateRequests[projectId] || [];
    return requests[0];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
              <Loader2 className="h-7 w-7 text-primary-foreground animate-spin" />
            </div>
          </div>
          <p className="text-muted-foreground">Loading your projects...</p>
        </div>
      </div>
    );
  }

  if (projects.length === 0) {
    return <EmptyState icon={Target} title="No Projects Yet" description="Your projects will appear here once they're set up by your team." />;
  }

  const completedCount = projects.filter(p => p.status === 'completed').length;
  const inProgressCount = projects.filter(p => p.status === 'in_progress').length;
  const visibleProjects = showCompleted ? projects : projects.filter(p => p.status !== 'completed');

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Your Projects"
          description="Track progress, ask questions, and request updates on your projects"
          icon={LayoutDashboard}
          badge={`${projects.length} Projects`}
        />
        {completedCount > 0 && (
          <button
            onClick={() => setShowCompleted(v => !v)}
            className={cn(
              "mt-1 text-xs px-3 py-1.5 rounded-full border transition-colors shrink-0",
              showCompleted
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {showCompleted ? `Showing All (${completedCount} completed)` : `Show Completed (${completedCount})`}
          </button>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Projects" value={projects.length} icon={Target} index={0} />
        <StatCard label="In Progress" value={inProgressCount} icon={Rocket} index={1} />
        <StatCard label="Completed" value={completedCount} icon={CheckCircle} index={2} />
      </div>

      {/* Request Update Dialog */}
      <Dialog open={requestUpdateOpen} onOpenChange={setRequestUpdateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Request Project Update
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {selectedProjectForUpdate && (
              <p className="text-sm text-muted-foreground">
                Request an update on <span className="font-medium text-foreground">{selectedProjectForUpdate.name}</span>
              </p>
            )}
            <Textarea
              placeholder="Any specific questions or areas you'd like an update on? (optional)"
              value={updateMessage}
              onChange={(e) => setUpdateMessage(e.target.value)}
              rows={4}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRequestUpdateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleRequestUpdate} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Send Request
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Projects List */}
      <div className="space-y-4">
        {visibleProjects.map((project, index) => {
          const projectMilestones = milestones[project.id] || [];
          const completedMilestones = projectMilestones.filter(m => m.status === 'completed').length;
          const isExpanded = expandedProject === project.id;
          const config = statusConfig[project.status] || statusConfig.pending;
          const latestUpdate = getLatestUpdateRequest(project.id);
          const projectCommentsList = getProjectComments(project.id);
          const health = getProjectHealth(project, projectMilestones);

          return (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
            >
              <ModernCard className={cn("transition-all duration-300", isExpanded && "ring-2 ring-primary/20")} padding="none">
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap mb-2">
                        <h3 className="text-lg font-semibold text-foreground">{project.name}</h3>
                        <StatusBadge status={config.label} variant={config.variant} />
                        {health && (
                          <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", health.cls)}>
                            {health.label}
                          </span>
                        )}
                      </div>
                      {project.description && (
                        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{project.description}</p>
                      )}
                      
                      {/* Progress Bar */}
                      <div className="space-y-2 mb-4">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Progress</span>
                          <span className="font-semibold text-foreground">{project.progress_percentage}%</span>
                        </div>
                        <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${project.progress_percentage}%` }}
                            transition={{ duration: 0.8, delay: 0.2 }}
                            className={cn("h-full rounded-full bg-gradient-to-r", getProgressGradient(project.progress_percentage))}
                          />
                        </div>
                      </div>

                      {/* Meta Info */}
                      <div className="flex flex-wrap gap-4 text-sm mb-4">
                        {project.start_date && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            <span>Started: {format(new Date(project.start_date), "MMM d, yyyy")}</span>
                          </div>
                        )}
                        {project.target_end_date && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Flag className="h-4 w-4" />
                            <span>Target: {format(new Date(project.target_end_date), "MMM d, yyyy")}</span>
                          </div>
                        )}
                        {projectMilestones.length > 0 && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <CheckCircle className="h-4 w-4" />
                            <span>{completedMilestones}/{projectMilestones.length} milestones</span>
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProjectForUpdate(project);
                            setRequestUpdateOpen(true);
                          }}
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Request Update
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCommentingProject(commentingProject === project.id ? null : project.id);
                          }}
                        >
                          <HelpCircle className="h-4 w-4 mr-2" />
                          Ask Question
                        </Button>
                        {projectCommentsList.length > 0 && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowComments(showComments === project.id ? null : project.id);
                            }}
                          >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            {projectCommentsList.length} Comments
                          </Button>
                        )}
                      </div>

                      {/* Latest Update Request Status */}
                      {latestUpdate && (
                        <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-border/50">
                          <div className="flex items-center gap-2 text-sm">
                            <Bell className="h-4 w-4 text-primary" />
                            <span className="font-medium">Latest Update Request</span>
                            <StatusBadge 
                              status={latestUpdate.status === 'responded' ? 'Responded' : latestUpdate.status === 'acknowledged' ? 'Acknowledged' : 'Pending'} 
                              variant={latestUpdate.status === 'responded' ? 'success' : latestUpdate.status === 'acknowledged' ? 'info' : 'default'} 
                            />
                          </div>
                          {latestUpdate.response && (
                            <p className="mt-2 text-sm text-muted-foreground">{latestUpdate.response}</p>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground">
                            Requested {formatDistanceToNow(new Date(latestUpdate.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setExpandedProject(isExpanded ? null : project.id)}
                      className="p-2 rounded-lg hover:bg-muted/50"
                    >
                      <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      </motion.div>
                    </button>
                  </div>

                  {/* Project Question Form */}
                  <AnimatePresence>
                    {commentingProject === project.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="mt-4 pt-4 border-t border-border/50"
                      >
                        <div className="space-y-3">
                          <Textarea
                            placeholder="Ask a question about this project..."
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            rows={3}
                          />
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setCommentingProject(null)}>
                              Cancel
                            </Button>
                            <Button 
                              size="sm" 
                              onClick={() => handleSubmitComment(project.id)}
                              disabled={!newComment.trim() || submitting}
                            >
                              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                              Send
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Project Comments */}
                  <AnimatePresence>
                    {showComments === project.id && projectCommentsList.length > 0 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="mt-4 pt-4 border-t border-border/50"
                      >
                        <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-primary" />
                          Project Discussion
                        </h4>
                        <div className="space-y-3 max-h-64 overflow-y-auto">
                          {projectCommentsList.map((comment) => (
                            <div 
                              key={comment.id} 
                              className={cn(
                                "p-3 rounded-lg text-sm",
                                comment.sender_type === 'client' 
                                  ? "bg-primary/10 border border-primary/20 ml-8" 
                                  : "bg-muted/50 border border-border/50 mr-8"
                              )}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium">
                                  {comment.sender_type === 'client' ? 'You' : comment.sender_name || 'Team'}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                                </span>
                              </div>
                              <p className="text-muted-foreground">{comment.message}</p>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Milestones */}
                <AnimatePresence>
                  {isExpanded && projectMilestones.length > 0 && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="px-6 pb-6 border-t border-border/50">
                        <div className="pt-6">
                          <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                            <Target className="h-4 w-4 text-primary" />
                            Project Milestones
                          </h4>
                          <div className="relative">
                            <div className="absolute left-[11px] top-4 bottom-4 w-0.5 bg-border/50" />
                            <div className="space-y-4">
                              {projectMilestones.map((milestone, idx) => {
                                const milestoneComments = getMilestoneComments(milestone.id);
                                const isCommenting = commentingMilestone === milestone.id;
                                const overdue = isMilestoneOverdue(milestone);

                                return (
                                  <motion.div
                                    key={milestone.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.3, delay: idx * 0.1 }}
                                    className="flex gap-4 relative"
                                  >
                                    <div className="relative z-10 bg-background">{getMilestoneIcon(milestone.status)}</div>
                                    <div className={cn(
                                      "flex-1 p-4 rounded-xl border transition-all",
                                      milestone.status === 'completed' && "bg-emerald-500/5 border-emerald-500/20",
                                      milestone.status === 'in_progress' && !overdue && "bg-blue-500/5 border-blue-500/20",
                                      overdue && "bg-red-500/5 border-red-500/30",
                                      milestone.status === 'pending' && !overdue && "bg-muted/30 border-border/50"
                                    )}>
                                      <div className="flex items-start justify-between gap-2 mb-2">
                                        <h5 className="font-medium text-foreground flex items-center gap-2">
                                          {milestone.name}
                                          {overdue && (
                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                                              <AlertTriangle className="h-3 w-3" />
                                              Overdue
                                            </span>
                                          )}
                                        </h5>
                                        <StatusBadge
                                          status={statusConfig[milestone.status]?.label || milestone.status}
                                          variant={statusConfig[milestone.status]?.variant || "default"}
                                        />
                                      </div>
                                      {milestone.description && (
                                        <p className="text-sm text-muted-foreground mb-2">{milestone.description}</p>
                                      )}
                                      <div className="flex gap-4 text-xs text-muted-foreground mb-3">
                                        {milestone.due_date && (
                                          <span className={cn(overdue && "text-red-500 font-medium")}>
                                            Due: {format(new Date(milestone.due_date), "MMM d, yyyy")}
                                          </span>
                                        )}
                                        {milestone.completed_at && (
                                          <span className="text-emerald-600">Completed: {format(new Date(milestone.completed_at), "MMM d, yyyy")}</span>
                                        )}
                                      </div>

                                      {/* Milestone Actions */}
                                      <div className="flex items-center gap-2">
                                        <Button 
                                          variant="ghost" 
                                          size="sm"
                                          className="h-8 text-xs"
                                          onClick={() => setCommentingMilestone(isCommenting ? null : milestone.id)}
                                        >
                                          <MessageCircle className="h-3 w-3 mr-1" />
                                          Ask Question
                                        </Button>
                                        {milestoneComments.length > 0 && (
                                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                                            <MessageSquare className="h-3 w-3" />
                                            {milestoneComments.length}
                                          </span>
                                        )}
                                      </div>

                                      {/* Milestone Comments */}
                                      {milestoneComments.length > 0 && (
                                        <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                                          {milestoneComments.map((comment) => (
                                            <div 
                                              key={comment.id} 
                                              className={cn(
                                                "p-2 rounded-lg text-xs",
                                                comment.sender_type === 'client' 
                                                  ? "bg-primary/10 border border-primary/20" 
                                                  : "bg-background border border-border/50"
                                              )}
                                            >
                                              <div className="flex items-center justify-between mb-1">
                                                <span className="font-medium">
                                                  {comment.sender_type === 'client' ? 'You' : comment.sender_name || 'Team'}
                                                </span>
                                                <span className="text-muted-foreground">
                                                  {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                                                </span>
                                              </div>
                                              <p className="text-muted-foreground">{comment.message}</p>
                                            </div>
                                          ))}
                                        </div>
                                      )}

                                      {/* Comment Form */}
                                      <AnimatePresence>
                                        {isCommenting && (
                                          <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="mt-3 space-y-2"
                                          >
                                            <Textarea
                                              placeholder="Ask a question about this milestone..."
                                              value={newComment}
                                              onChange={(e) => setNewComment(e.target.value)}
                                              rows={2}
                                              className="text-sm"
                                            />
                                            <div className="flex justify-end gap-2">
                                              <Button 
                                                variant="ghost" 
                                                size="sm"
                                                className="h-7 text-xs"
                                                onClick={() => setCommentingMilestone(null)}
                                              >
                                                Cancel
                                              </Button>
                                              <Button 
                                                size="sm"
                                                className="h-7 text-xs"
                                                onClick={() => handleSubmitComment(project.id, milestone.id)}
                                                disabled={!newComment.trim() || submitting}
                                              >
                                                {submitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                                                Send
                                              </Button>
                                            </div>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>
                                  </motion.div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Deliverables linked to this project */}
                          {(deliverables[project.id] || []).length > 0 && (
                            <div className="mt-6 pt-6 border-t border-border/50">
                              <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                                <Paperclip className="h-4 w-4 text-primary" />
                                Deliverables
                              </h4>
                              <div className="space-y-2">
                                {(deliverables[project.id] || []).map((d) => (
                                  <div key={d.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/40 gap-3">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-foreground truncate">{d.title}</p>
                                      <div className="flex items-center gap-3 mt-0.5">
                                        {d.category && (
                                          <span className="text-xs text-muted-foreground capitalize">{d.category}</span>
                                        )}
                                        {d.submitted_at && (
                                          <span className="text-xs text-muted-foreground">
                                            {format(new Date(d.submitted_at), "MMM d, yyyy")}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <StatusBadge
                                        status={d.status === 'pending_review' ? 'Pending Review' : d.status === 'approved' ? 'Approved' : d.status === 'revision_requested' ? 'Revision' : d.status}
                                        variant={getDeliverableStatusVariant(d.status)}
                                      />
                                      {d.file_url && (
                                        <a
                                          href={d.file_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                        >
                                          <FileDown className="h-3.5 w-3.5" />
                                          Download
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {!isExpanded && projectMilestones.length > 0 && (
                  <div className="px-6 pb-4">
                    <p className="text-xs text-muted-foreground text-center">Click to view {projectMilestones.length} milestones</p>
                  </div>
                )}
              </ModernCard>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}