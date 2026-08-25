import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, Calendar, Target, CheckCircle, Clock, ChevronDown, Circle,
  Bot, Rocket, Flag, Send, RefreshCw, Search, Share2, Users, ExternalLink,
  MessageSquare, Bell, AlertTriangle, FileDown, Paperclip, Sparkles
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { PageHeader, StatCard, ModernCard, EmptyState, StatusBadge } from "./PortalUI";
import { toast } from "sonner";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  start_date: string | null;
  target_end_date: string | null;
  progress_percentage: number;
  kind: string;
}

// Milestones mean something different per engine: an SEO checklist item
// completes once and stays done; a content pillar is a recurring theme that's
// always "in use," never finished; a funnel stage locks in once reached. One
// generic "Project Milestones" list reads as a stuck checklist either way, so
// label + explain each kind instead of leaving the client to guess.
const kindMeta: Record<string, { sectionLabel: string; hint: string }> = {
  seo: { sectionLabel: "Fix Checklist", hint: "Each item is an SEO issue found on your site. It checks off once the fix is applied and confirmed on the next scan." },
  social: { sectionLabel: "Content Pillars", hint: "These are the recurring themes your posts rotate through, not tasks to finish. The progress bar above tracks posts published this month against your plan." },
  prospect: { sectionLabel: "Outreach Funnel", hint: "Each stage locks in once prospects reach it — discovered, contacted, replied, converted. The count updates automatically as outreach runs." },
};

// Client-facing framing: each "project kind" is presented as a named agent
// working on the client's behalf, rather than a generic project row.
const agentMeta: Record<string, { name: string; tagline: string; icon: typeof Bot; iconBg: string }> = {
  seo: { name: "SEO Agent", tagline: "Finds and fixes what's holding your search rankings back", icon: Search, iconBg: "from-blue-500 to-cyan-400" },
  social: { name: "Social Agent", tagline: "Plans and grows your content across social channels", icon: Share2, iconBg: "from-purple-500 to-fuchsia-400" },
  prospect: { name: "Prospect Agent", tagline: "Finds new leads and runs outreach on your behalf", icon: Users, iconBg: "from-emerald-500 to-teal-400" },
};
const defaultAgentMeta = { name: "Agent", tagline: "", icon: Bot, iconBg: "from-primary to-primary/80" };
const getAgentMeta = (kind: string) => agentMeta[kind] || defaultAgentMeta;

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
  onNavigateToTab?: (tab: string) => void;
}

// Maps an agent's project kind to its dedicated detail tab elsewhere in the
// sidebar, so a client can jump from the summary card to the full picture.
const agentDetailTab: Record<string, string> = { seo: "seo", social: "social", prospect: "prospects" };

const statusConfig: Record<string, { label: string; variant: "default" | "success" | "warning" | "error" | "info" }> = {
  completed: { label: "Completed", variant: "success" },
  in_progress: { label: "In Progress", variant: "info" },
  on_hold: { label: "On Hold", variant: "warning" },
  pending: { label: "Pending", variant: "default" },
  awaiting_setup: { label: "Setting Up", variant: "default" },
};

export default function ClientProjectsTab({ clientAccountId, onNavigateToTab }: ClientProjectsTabProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Record<string, Milestone[]>>({});
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [updateRequests, setUpdateRequests] = useState<Record<string, UpdateRequest[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requestUpdateOpen, setRequestUpdateOpen] = useState(false);
  const [selectedProjectForUpdate, setSelectedProjectForUpdate] = useState<Project | null>(null);
  const [updateMessage, setUpdateMessage] = useState("");
  const [showComments, setShowComments] = useState<string | null>(null);
  const [deliverables, setDeliverables] = useState<Record<string, Deliverable[]>>({});
  const [showCompleted, setShowCompleted] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [regeneratingProject, setRegeneratingProject] = useState<string | null>(null);
  // Same substance check as the backend hasBusinessContext gate -- lets an
  // "awaiting_setup" social/prospect agent explain *why* (waiting on you)
  // instead of a generic "check back soon" that reads identically whether
  // the client is blocking it or an engine just hasn't run yet.
  const [hasBusinessInfo, setHasBusinessInfo] = useState(true);
  // SEO's blocker is different (a URL to crawl, not industry/audience) --
  // tracked separately so the SEO card explains the right thing.
  const [hasWebsiteUrl, setHasWebsiteUrl] = useState(true);

  useEffect(() => {
    supabase
      .from("client_accounts")
      .select("industry, context_profile, website_url")
      .eq("id", clientAccountId)
      .maybeSingle()
      .then(({ data }) => {
        const audience = (data?.context_profile as Record<string, unknown> | null)?.target_audience;
        setHasBusinessInfo(!!data?.industry?.trim() && typeof audience === "string" && audience.trim().length > 0);
        setHasWebsiteUrl(!!data?.website_url?.trim());
      });
  }, [clientAccountId]);

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
    setFetchFailed(false);
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
      setFetchFailed(true);
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
      toast.error("Couldn't load deliverables for this project — try refreshing.");
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
      toast.error("Couldn't load comments — try refreshing.");
    }
  };

  const handleRegenerateStrategy = async (projectId: string) => {
    setRegeneratingProject(projectId);
    try {
      const { data, error } = await supabase.functions.invoke("regenerate-social-strategy", {
        body: { client_id: clientAccountId },
      });

      const errMsg = await getEdgeErrorMessage(error, data);
      if (errMsg) throw new Error(friendlyEdgeMessage(errMsg));

      toast.success("New content topics generated!");
      await fetchProjects();
    } catch (error) {
      console.error("Error regenerating strategy:", error);
      toast.error(error instanceof Error ? error.message : "Failed to regenerate topics");
    } finally {
      setRegeneratingProject(null);
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

  const getMilestoneIcon = (status: string, kind?: string) => {
    // Content pillars are always "in_progress" by design (a theme is in use,
    // never finished) — the clock icon would read as stuck. Use a neutral
    // marker for that kind instead.
    if (kind === "social") return <Target className="h-5 w-5 text-primary" />;
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
    // Shells with no engine work yet have no target/milestones to be "on track"
    // or "delayed" against -- an On Track badge here would just be noise.
    if (project.status === 'completed' || project.status === 'pending' || project.status === 'awaiting_setup') return null;
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
          <p className="text-muted-foreground">Loading your agents...</p>
        </div>
      </div>
    );
  }

  if (fetchFailed) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load your agents"
        description="Something went wrong loading this page. Try again — if it keeps happening, let your team know."
        action={
          <Button onClick={fetchProjects}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        }
      />
    );
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={Bot}
        title="No Agents Yet"
        description="Your agents unlock automatically once your onboarding checklist is complete — see the Home tab for what's left."
      />
    );
  }

  const completedCount = projects.filter(p => p.status === 'completed').length;
  const inProgressCount = projects.filter(p => p.status === 'in_progress').length;
  const settingUpCount = projects.filter(p => p.status === 'awaiting_setup').length;
  const visibleProjects = showCompleted ? projects : projects.filter(p => p.status !== 'completed');

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Your Agents"
          description="Track what each agent is doing, ask questions, and request updates"
          icon={Bot}
          badge={`${projects.length} Agent${projects.length === 1 ? "" : "s"}`}
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
      <div className={cn("grid grid-cols-1 sm:grid-cols-3 gap-4", settingUpCount > 0 && "lg:grid-cols-4")}>
        <StatCard label="Active Agents" value={projects.length} icon={Bot} index={0} />
        <StatCard label="Working Now" value={inProgressCount} icon={Rocket} index={1} />
        <StatCard label="Completed" value={completedCount} icon={CheckCircle} index={2} />
        {settingUpCount > 0 && (
          <StatCard label="Setting Up" value={settingUpCount} icon={Clock} index={3} />
        )}
      </div>

      {/* Request Update Dialog */}
      <Dialog open={requestUpdateOpen} onOpenChange={setRequestUpdateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Request Agent Update
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {selectedProjectForUpdate && (
              <p className="text-sm text-muted-foreground">
                Request an update from your <span className="font-medium text-foreground">{getAgentMeta(selectedProjectForUpdate.kind).name}</span>
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
          const agent = getAgentMeta(project.kind);
          const AgentIcon = agent.icon;

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
                      <div className="flex items-start gap-3 mb-3">
                        <div className={cn("shrink-0 p-2.5 rounded-xl bg-gradient-to-br shadow-sm", agent.iconBg)}>
                          <AgentIcon className="h-5 w-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="text-lg font-semibold text-foreground">{agent.name}</h3>
                            <StatusBadge status={config.label} variant={config.variant} />
                            {health && (
                              <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", health.cls)}>
                                {health.label}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{project.name}</p>
                        </div>
                      </div>
                      {(() => {
                        const isAwaitingSetup = project.status === "awaiting_setup";
                        // SEO's blocker is a missing website URL, not business
                        // info (it crawls the real site regardless of industry/
                        // audience); social/prospect are blocked by the latter.
                        const blockedOnUrl = isAwaitingSetup && project.kind === "seo" && !hasWebsiteUrl;
                        const blockedOnBusinessInfo =
                          isAwaitingSetup && !hasBusinessInfo && (project.kind === "social" || project.kind === "prospect");
                        const blocked = blockedOnUrl || blockedOnBusinessInfo;
                        const description = blockedOnUrl
                          ? "Waiting on you: add your website URL under \"Confirm Business Information\" on Home (or Settings → Company Context) — nothing to crawl without it."
                          : blockedOnBusinessInfo
                          ? "Waiting on you: complete \"Confirm Business Information\" on Home (or Settings → Company Context) to get this started."
                          : project.description || agent.tagline;
                        return description ? (
                          <p className={cn("text-sm mb-4 line-clamp-2", blocked ? "text-orange-600 dark:text-orange-400 font-medium" : "text-muted-foreground")}>
                            {description}
                          </p>
                        ) : null;
                      })()}

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
                        {onNavigateToTab && agentDetailTab[project.kind] && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigateToTab(agentDetailTab[project.kind]);
                            }}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            View Full Detail
                          </Button>
                        )}
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
                  {isExpanded && (projectMilestones.length > 0 || project.kind === "social") && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="px-6 pb-6 border-t border-border/50">
                        <div className="pt-6">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <h4 className="font-semibold text-foreground flex items-center gap-2">
                              <Target className="h-4 w-4 text-primary" />
                              {kindMeta[project.kind]?.sectionLabel || "Project Milestones"}
                            </h4>
                            {project.kind === "social" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRegenerateStrategy(project.id);
                                }}
                                disabled={regeneratingProject === project.id}
                              >
                                {regeneratingProject === project.id ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Sparkles className="h-4 w-4 mr-2" />
                                )}
                                {projectMilestones.length > 0 ? "Change Topics" : "Generate Topics"}
                              </Button>
                            )}
                          </div>
                          {projectMilestones.length === 0 && project.kind === "social" ? (
                            <p className="text-xs text-muted-foreground mb-4">
                              No content pillars yet — click "Generate Topics" to have your Social Agent set your plan's themes now instead of waiting for the weekly refresh.
                            </p>
                          ) : kindMeta[project.kind]?.hint && (
                            <p className="text-xs text-muted-foreground mb-4">{kindMeta[project.kind].hint}</p>
                          )}
                          <div className="relative">
                            <div className="absolute left-[11px] top-4 bottom-4 w-0.5 bg-border/50" />
                            <div className="space-y-4">
                              {projectMilestones.map((milestone, idx) => {
                                const milestoneComments = getMilestoneComments(milestone.id);
                                const overdue = isMilestoneOverdue(milestone);

                                return (
                                  <motion.div
                                    key={milestone.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.3, delay: idx * 0.1 }}
                                    className="flex gap-4 relative"
                                  >
                                    <div className="relative z-10 bg-background">{getMilestoneIcon(milestone.status, project.kind)}</div>
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
                                          status={project.kind === "social" ? "Active" : (statusConfig[milestone.status]?.label || milestone.status)}
                                          variant={project.kind === "social" ? "info" : (statusConfig[milestone.status]?.variant || "default")}
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

                                      {milestoneComments.length > 0 && (
                                        <div className="flex items-center gap-2 mb-2">
                                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                                            <MessageSquare className="h-3 w-3" />
                                            {milestoneComments.length} comment{milestoneComments.length === 1 ? "" : "s"}
                                          </span>
                                        </div>
                                      )}

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