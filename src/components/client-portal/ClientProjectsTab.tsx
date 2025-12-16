import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Calendar, Target, CheckCircle, Clock, ChevronDown, Circle, LayoutDashboard, Rocket, Flag } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { PageHeader, StatCard, ModernCard, EmptyState, StatusBadge } from "./PortalUI";

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
  const [loading, setLoading] = useState(true);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

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

    return () => {
      supabase.removeChannel(projectsChannel);
      supabase.removeChannel(milestonesChannel);
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
      }
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setLoading(false);
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

  return (
    <div className="space-y-8">
      <PageHeader 
        title="Your Projects" 
        description="Track progress on all your digital marketing initiatives"
        icon={LayoutDashboard}
        badge={`${projects.length} Projects`}
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Projects" value={projects.length} icon={Target} index={0} />
        <StatCard label="In Progress" value={inProgressCount} icon={Rocket} index={1} />
        <StatCard label="Completed" value={completedCount} icon={CheckCircle} index={2} />
      </div>

      {/* Projects List */}
      <div className="space-y-4">
        {projects.map((project, index) => {
          const projectMilestones = milestones[project.id] || [];
          const completedMilestones = projectMilestones.filter(m => m.status === 'completed').length;
          const isExpanded = expandedProject === project.id;
          const config = statusConfig[project.status] || statusConfig.pending;

          return (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
            >
              <ModernCard className={cn("transition-all duration-300", isExpanded && "ring-2 ring-primary/20")} padding="none">
                <button 
                  className="w-full p-6 text-left"
                  onClick={() => setExpandedProject(isExpanded ? null : project.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap mb-2">
                        <h3 className="text-lg font-semibold text-foreground">{project.name}</h3>
                        <StatusBadge status={config.label} variant={config.variant} />
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
                      <div className="flex flex-wrap gap-4 text-sm">
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
                    </div>
                    <motion.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="p-2 rounded-lg hover:bg-muted/50"
                    >
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    </motion.div>
                  </div>
                </button>

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
                              {projectMilestones.map((milestone, idx) => (
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
                                    milestone.status === 'in_progress' && "bg-blue-500/5 border-blue-500/20",
                                    milestone.status === 'pending' && "bg-muted/30 border-border/50"
                                  )}>
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                      <h5 className="font-medium text-foreground">{milestone.name}</h5>
                                      <StatusBadge 
                                        status={statusConfig[milestone.status]?.label || milestone.status} 
                                        variant={statusConfig[milestone.status]?.variant || "default"} 
                                      />
                                    </div>
                                    {milestone.description && (
                                      <p className="text-sm text-muted-foreground mb-2">{milestone.description}</p>
                                    )}
                                    <div className="flex gap-4 text-xs text-muted-foreground">
                                      {milestone.due_date && <span>Due: {format(new Date(milestone.due_date), "MMM d, yyyy")}</span>}
                                      {milestone.completed_at && (
                                        <span className="text-emerald-600">Completed: {format(new Date(milestone.completed_at), "MMM d, yyyy")}</span>
                                      )}
                                    </div>
                                  </div>
                                </motion.div>
                              ))}
                            </div>
                          </div>
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
