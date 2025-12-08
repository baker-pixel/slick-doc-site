import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Calendar, Target, CheckCircle, Clock } from "lucide-react";
import { format } from "date-fns";

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "in_progress":
        return "bg-blue-100 text-blue-800";
      case "on_hold":
        return "bg-yellow-100 text-yellow-800";
      case "pending":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getMilestoneIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "in_progress":
        return <Clock className="h-4 w-4 text-blue-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Your Projects</h2>
        <p className="text-muted-foreground">Track progress on all your digital marketing initiatives</p>
      </div>

      <div className="grid gap-6">
        {projects.map((project) => (
          <Card 
            key={project.id} 
            className="cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => setExpandedProject(expandedProject === project.id ? null : project.id)}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{project.name}</CardTitle>
                  {project.description && (
                    <CardDescription className="mt-1">{project.description}</CardDescription>
                  )}
                </div>
                <Badge className={getStatusColor(project.status)}>
                  {project.status.replace("_", " ")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">{project.progress_percentage}%</span>
                </div>
                <Progress value={project.progress_percentage} className="h-2" />
              </div>

              {/* Dates */}
              <div className="flex gap-6 text-sm">
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
              </div>

              {/* Milestones (expanded) */}
              {expandedProject === project.id && milestones[project.id] && (
                <div className="mt-4 pt-4 border-t space-y-3">
                  <h4 className="font-medium text-sm text-foreground">Milestones</h4>
                  {milestones[project.id].map((milestone) => (
                    <div 
                      key={milestone.id} 
                      className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                    >
                      {getMilestoneIcon(milestone.status)}
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{milestone.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {milestone.status.replace("_", " ")}
                          </Badge>
                        </div>
                        {milestone.description && (
                          <p className="text-xs text-muted-foreground mt-1">{milestone.description}</p>
                        )}
                        {milestone.due_date && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Due: {format(new Date(milestone.due_date), "MMM d, yyyy")}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
