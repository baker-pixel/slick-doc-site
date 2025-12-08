import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Calendar, Target, CheckCircle, Clock, ChevronDown, ChevronUp, Circle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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

export default function ClientProjectsTab({ clientAccountId }: ClientProjectsTabProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Record<string, Milestone[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
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

      // Auto-expand first in-progress project
      const inProgressProject = projectsData?.find(p => p.status === 'in_progress');
      if (inProgressProject) {
        setExpandedProject(inProgressProject.id);
      }

      // Fetch milestones for all projects
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500/10 text-green-600 border-green-200 hover:bg-green-500/20">Completed</Badge>;
      case "in_progress":
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200 hover:bg-blue-500/20">In Progress</Badge>;
      case "on_hold":
        return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-200 hover:bg-yellow-500/20">On Hold</Badge>;
      case "pending":
        return <Badge className="bg-gray-500/10 text-gray-600 border-gray-200 hover:bg-gray-500/20">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getMilestoneIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "in_progress":
        return <Clock className="h-5 w-5 text-blue-600" />;
      default:
        return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getProgressColor = (percentage: number) => {
    if (percentage === 100) return "bg-green-500";
    if (percentage >= 50) return "bg-blue-500";
    if (percentage > 0) return "bg-amber-500";
    return "bg-gray-300";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground">No Projects Yet</h3>
          <p className="text-muted-foreground">Your projects will appear here once they're set up.</p>
        </CardContent>
      </Card>
    );
  }

  // Summary stats
  const completedCount = projects.filter(p => p.status === 'completed').length;
  const inProgressCount = projects.filter(p => p.status === 'in_progress').length;
  const avgProgress = Math.round(projects.reduce((sum, p) => sum + p.progress_percentage, 0) / projects.length);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Your Projects</h2>
        <p className="text-muted-foreground">Track progress on all your digital marketing initiatives</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-foreground">{projects.length}</p>
              <p className="text-sm text-muted-foreground">Total Projects</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">{inProgressCount}</p>
              <p className="text-sm text-muted-foreground">In Progress</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-600">{completedCount}</p>
              <p className="text-sm text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Projects List */}
      <div className="space-y-4">
        {projects.map((project) => {
          const projectMilestones = milestones[project.id] || [];
          const completedMilestones = projectMilestones.filter(m => m.status === 'completed').length;
          const isExpanded = expandedProject === project.id;

          return (
            <Card 
              key={project.id} 
              className={cn(
                "transition-all duration-200",
                isExpanded && "ring-2 ring-primary/20"
              )}
            >
              <CardHeader 
                className="cursor-pointer"
                onClick={() => setExpandedProject(isExpanded ? null : project.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-lg">{project.name}</CardTitle>
                      {getStatusBadge(project.status)}
                    </div>
                    {project.description && (
                      <CardDescription className="mt-2">{project.description}</CardDescription>
                    )}
                  </div>
                  <button className="p-1 hover:bg-muted rounded">
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Overall Progress</span>
                    <span className="font-medium">{project.progress_percentage}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={cn("h-full transition-all duration-500", getProgressColor(project.progress_percentage))}
                      style={{ width: `${project.progress_percentage}%` }}
                    />
                  </div>
                </div>

                {/* Dates & Milestone Count */}
                <div className="flex flex-wrap gap-4 text-sm">
                  {project.start_date && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>Started: {format(new Date(project.start_date), "MMM d, yyyy")}</span>
                    </div>
                  )}
                  {project.target_end_date && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Target className="h-4 w-4" />
                      <span>Target: {format(new Date(project.target_end_date), "MMM d, yyyy")}</span>
                    </div>
                  )}
                  {projectMilestones.length > 0 && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle className="h-4 w-4" />
                      <span>{completedMilestones}/{projectMilestones.length} milestones complete</span>
                    </div>
                  )}
                </div>

                {/* Milestones Timeline (expanded) */}
                {isExpanded && projectMilestones.length > 0 && (
                  <div className="mt-6 pt-6 border-t">
                    <h4 className="font-semibold text-foreground mb-4">Project Milestones</h4>
                    <div className="relative">
                      {/* Timeline line */}
                      <div className="absolute left-[10px] top-3 bottom-3 w-0.5 bg-muted" />
                      
                      <div className="space-y-4">
                        {projectMilestones.map((milestone, index) => (
                          <div 
                            key={milestone.id} 
                            className="flex gap-4 relative"
                          >
                            {/* Icon */}
                            <div className="relative z-10 bg-background">
                              {getMilestoneIcon(milestone.status)}
                            </div>
                            
                            {/* Content */}
                            <div className={cn(
                              "flex-1 p-4 rounded-lg border transition-colors",
                              milestone.status === 'completed' && "bg-green-50/50 border-green-200",
                              milestone.status === 'in_progress' && "bg-blue-50/50 border-blue-200",
                              milestone.status === 'pending' && "bg-muted/30"
                            )}>
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <h5 className="font-medium text-foreground">{milestone.name}</h5>
                                  {milestone.description && (
                                    <p className="text-sm text-muted-foreground mt-1">{milestone.description}</p>
                                  )}
                                </div>
                                {getStatusBadge(milestone.status)}
                              </div>
                              
                              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                                {milestone.due_date && (
                                  <span>Due: {format(new Date(milestone.due_date), "MMM d, yyyy")}</span>
                                )}
                                {milestone.completed_at && (
                                  <span className="text-green-600">
                                    Completed: {format(new Date(milestone.completed_at), "MMM d, yyyy")}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Click to expand hint */}
                {!isExpanded && projectMilestones.length > 0 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    Click to view {projectMilestones.length} milestones
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
