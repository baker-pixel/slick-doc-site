import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Plus, Trash2, Edit, Target, Milestone, Sparkles, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface ClientAccountWithTier {
  id: string;
  business_name: string;
  tier: string;
}

interface ClientAccount {
  id: string;
  business_name: string;
}

interface ProjectMilestone {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  due_date: string | null;
  status: string;
  sort_order: number;
}

interface ClientProject {
  id: string;
  client_account_id: string;
  name: string;
  description: string | null;
  status: string;
  start_date: string | null;
  target_end_date: string | null;
  progress_percentage: number;
  created_at: string;
  client_accounts?: { business_name: string };
  project_milestones?: ProjectMilestone[];
}

export function ClientProjectsAdminPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMilestoneOpen, setIsMilestoneOpen] = useState(false);
  const [isAIDialogOpen, setIsAIDialogOpen] = useState(false);
  const [selectedClientForAI, setSelectedClientForAI] = useState<string>("");
  const [editingProject, setEditingProject] = useState<ClientProject | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    client_account_id: '',
    name: '',
    description: '',
    status: 'in_progress',
    start_date: '',
    target_end_date: '',
    progress_percentage: '0',
  });
  const [milestoneData, setMilestoneData] = useState({
    name: '',
    description: '',
    due_date: '',
    status: 'pending',
  });
  const queryClient = useQueryClient();

  const { data: projects, isLoading } = useQuery({
    queryKey: ['admin-client-projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_projects')
        .select('*, client_accounts(business_name), project_milestones(*)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ClientProject[];
    },
  });

  const { data: clients } = useQuery({
    queryKey: ['client-accounts-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_accounts')
        .select('id, business_name, tier')
        .order('business_name');

      if (error) throw error;
      return data as ClientAccountWithTier[];
    },
  });

  const generateProjectsMutation = useMutation({
    mutationFn: async (clientAccountId: string) => {
      const { data, error } = await supabase.functions.invoke('generate-client-projects', {
        body: { clientAccountId }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-client-projects'] });
      toast.success(`Generated ${data.projectsCreated} projects with milestones!`);
      setIsAIDialogOpen(false);
      setSelectedClientForAI("");
    },
    onError: (error: Error) => {
      console.error('AI generation error:', error);
      if (error.message.includes('Rate limit')) {
        toast.error("Rate limit exceeded. Please wait a moment and try again.");
      } else if (error.message.includes('credits')) {
        toast.error("AI credits exhausted. Please add funds to continue.");
      } else {
        toast.error("Failed to generate projects: " + error.message);
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from('client_projects')
        .insert([{
          client_account_id: data.client_account_id,
          name: data.name,
          description: data.description || null,
          status: data.status,
          start_date: data.start_date || null,
          target_end_date: data.target_end_date || null,
          progress_percentage: parseInt(data.progress_percentage) || 0,
        }]);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-client-projects'] });
      toast.success("Project created");
      resetForm();
    },
    onError: (error) => {
      console.error('Create error:', error);
      toast.error("Failed to create project");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & typeof formData) => {
      const { error } = await supabase
        .from('client_projects')
        .update({
          client_account_id: data.client_account_id,
          name: data.name,
          description: data.description || null,
          status: data.status,
          start_date: data.start_date || null,
          target_end_date: data.target_end_date || null,
          progress_percentage: parseInt(data.progress_percentage) || 0,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-client-projects'] });
      toast.success("Project updated");
      resetForm();
    },
    onError: (error) => {
      console.error('Update error:', error);
      toast.error("Failed to update project");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('client_projects')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-client-projects'] });
      toast.success("Project deleted");
    },
    onError: (error) => {
      console.error('Delete error:', error);
      toast.error("Failed to delete project");
    },
  });

  const createMilestoneMutation = useMutation({
    mutationFn: async ({ projectId, ...data }: { projectId: string } & typeof milestoneData) => {
      const { data: existingMilestones } = await supabase
        .from('project_milestones')
        .select('sort_order')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: false })
        .limit(1);

      const nextOrder = (existingMilestones?.[0]?.sort_order || 0) + 1;

      const { error } = await supabase
        .from('project_milestones')
        .insert([{
          project_id: projectId,
          name: data.name,
          description: data.description || null,
          due_date: data.due_date || null,
          status: data.status,
          sort_order: nextOrder,
        }]);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-client-projects'] });
      toast.success("Milestone added");
      setMilestoneData({ name: '', description: '', due_date: '', status: 'pending' });
      setIsMilestoneOpen(false);
    },
    onError: (error) => {
      console.error('Create milestone error:', error);
      toast.error("Failed to add milestone");
    },
  });

  const deleteMilestoneMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('project_milestones')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-client-projects'] });
      toast.success("Milestone deleted");
    },
    onError: (error) => {
      console.error('Delete milestone error:', error);
      toast.error("Failed to delete milestone");
    },
  });

  const updateMilestoneStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('project_milestones')
        .update({ 
          status, 
          completed_at: status === 'completed' ? new Date().toISOString() : null 
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-client-projects'] });
      toast.success("Milestone status updated");
    },
    onError: (error) => {
      console.error('Update milestone error:', error);
      toast.error("Failed to update milestone");
    },
  });

  const resetForm = () => {
    setFormData({
      client_account_id: '',
      name: '',
      description: '',
      status: 'in_progress',
      start_date: '',
      target_end_date: '',
      progress_percentage: '0',
    });
    setEditingProject(null);
    setIsOpen(false);
  };

  const handleEdit = (project: ClientProject) => {
    setEditingProject(project);
    setFormData({
      client_account_id: project.client_account_id,
      name: project.name,
      description: project.description || '',
      status: project.status,
      start_date: project.start_date || '',
      target_end_date: project.target_end_date || '',
      progress_percentage: String(project.progress_percentage),
    });
    setIsOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.client_account_id || !formData.name) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (editingProject) {
      updateMutation.mutate({ id: editingProject.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleAddMilestone = () => {
    if (!selectedProjectId || !milestoneData.name) {
      toast.error("Please fill in milestone name");
      return;
    }
    createMilestoneMutation.mutate({ projectId: selectedProjectId, ...milestoneData });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Completed</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">In Progress</Badge>;
      case 'on_hold':
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">On Hold</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">Client Projects</h2>
          <p className="text-muted-foreground">Manage projects and milestones for clients.</p>
        </div>
        <div className="flex gap-2">
          {/* AI Generate Projects Button */}
          <Dialog open={isAIDialogOpen} onOpenChange={setIsAIDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Sparkles className="h-4 w-4 mr-2" />
                AI Generate Projects
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Generate Projects with AI
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <p className="text-sm text-muted-foreground">
                  AI will analyze the client's tier and SOPs to generate appropriate projects with milestones.
                </p>
                <div className="space-y-2">
                  <Label>Select Client</Label>
                  <Select value={selectedClientForAI} onValueChange={setSelectedClientForAI}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a client..." />
                    </SelectTrigger>
                    <SelectContent>
                      {clients?.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.business_name} 
                          <Badge variant="outline" className="ml-2 text-xs">
                            {client.tier}
                          </Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedClientForAI && (
                  <div className="p-3 bg-muted/50 rounded-lg text-sm">
                    <p className="font-medium">What AI will generate:</p>
                    <ul className="mt-2 space-y-1 text-muted-foreground">
                      <li>• 3-5 projects based on {clients?.find(c => c.id === selectedClientForAI)?.tier} tier</li>
                      <li>• Milestones with weekly due dates</li>
                      <li>• Categories from SOP action items</li>
                    </ul>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsAIDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => selectedClientForAI && generateProjectsMutation.mutate(selectedClientForAI)}
                    disabled={!selectedClientForAI || generateProjectsMutation.isPending}
                  >
                    {generateProjectsMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Generate Projects
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Manual Create Project Button */}
          <Dialog open={isOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsOpen(open); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Project
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingProject ? 'Edit Project' : 'Create New Project'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Client *</Label>
                <Select value={formData.client_account_id} onValueChange={(v) => setFormData({ ...formData, client_account_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients?.map((client) => (
                      <SelectItem key={client.id} value={client.id}>{client.business_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Project Name *</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Website Redesign" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Project description" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Target End Date</Label>
                  <Input type="date" value={formData.target_end_date} onChange={(e) => setFormData({ ...formData, target_end_date: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="on_hold">On Hold</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Progress ({formData.progress_percentage}%)</Label>
                  <Input type="range" min="0" max="100" value={formData.progress_percentage} onChange={(e) => setFormData({ ...formData, progress_percentage: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={resetForm}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingProject ? 'Update' : 'Create'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Milestone Dialog */}
      <Dialog open={isMilestoneOpen} onOpenChange={setIsMilestoneOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Milestone</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={milestoneData.name} onChange={(e) => setMilestoneData({ ...milestoneData, name: e.target.value })} placeholder="Discovery Phase" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={milestoneData.description} onChange={(e) => setMilestoneData({ ...milestoneData, description: e.target.value })} placeholder="Milestone details" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input type="date" value={milestoneData.due_date} onChange={(e) => setMilestoneData({ ...milestoneData, due_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={milestoneData.status} onValueChange={(v) => setMilestoneData({ ...milestoneData, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsMilestoneOpen(false)}>Cancel</Button>
              <Button onClick={handleAddMilestone} disabled={createMilestoneMutation.isPending}>Add</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-0">
          <Accordion type="single" collapsible className="w-full">
            {projects?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No projects yet. Create your first project to get started.
              </div>
            ) : (
              projects?.map((project) => (
                <AccordionItem key={project.id} value={project.id}>
                  <AccordionTrigger className="px-4 hover:no-underline">
                    <div className="flex items-center justify-between w-full pr-4">
                      <div className="flex items-center gap-3">
                        <Target className="h-5 w-5 text-primary" />
                        <div className="text-left">
                          <p className="font-medium">{project.name}</p>
                          <p className="text-sm text-muted-foreground">{project.client_accounts?.business_name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="w-24">
                          <Progress value={project.progress_percentage} className="h-2" />
                        </div>
                        {getStatusBadge(project.status)}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <div className="space-y-4">
                      {project.description && (
                        <p className="text-sm text-muted-foreground">{project.description}</p>
                      )}
                      <div className="flex gap-4 text-sm">
                        {project.start_date && <span>Start: {format(new Date(project.start_date), 'MMM d, yyyy')}</span>}
                        {project.target_end_date && <span>Target: {format(new Date(project.target_end_date), 'MMM d, yyyy')}</span>}
                      </div>
                      
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleEdit(project)}>
                          <Edit className="h-4 w-4 mr-1" /> Edit
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setSelectedProjectId(project.id); setIsMilestoneOpen(true); }}>
                          <Milestone className="h-4 w-4 mr-1" /> Add Milestone
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => deleteMutation.mutate(project.id)}>
                          <Trash2 className="h-4 w-4 mr-1 text-destructive" /> Delete
                        </Button>
                      </div>

                      {project.project_milestones && project.project_milestones.length > 0 && (
                        <div className="mt-4 border-t pt-4">
                          <h4 className="font-medium mb-2">Milestones</h4>
                          <div className="space-y-2">
                            {project.project_milestones.sort((a, b) => a.sort_order - b.sort_order).map((milestone) => (
                              <div key={milestone.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                                <div className="flex items-center gap-2">
                                  <Milestone className="h-4 w-4 text-muted-foreground" />
                                  <span>{milestone.name}</span>
                                  {milestone.due_date && <span className="text-xs text-muted-foreground">({format(new Date(milestone.due_date), 'MMM d')})</span>}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Select value={milestone.status} onValueChange={(status) => updateMilestoneStatusMutation.mutate({ id: milestone.id, status })}>
                                    <SelectTrigger className="w-28 h-8">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="pending">Pending</SelectItem>
                                      <SelectItem value="in_progress">In Progress</SelectItem>
                                      <SelectItem value="completed">Completed</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteMilestoneMutation.mutate(milestone.id)}>
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))
            )}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
