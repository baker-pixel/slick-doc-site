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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Plus, Trash2, Edit, Target, Milestone, Sparkles, Loader2, MessageCircle, Send, RefreshCw, CornerDownRight } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { ProjectSetupWizard } from "../misc/ProjectSetupWizard";

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

interface AdminComment {
  id: string;
  project_id: string;
  milestone_id: string | null;
  sender_type: string;
  sender_name: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface AdminUpdateRequest {
  id: string;
  project_id: string;
  message: string | null;
  status: string;
  response: string | null;
  responded_at: string | null;
  created_at: string;
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

export function ClientProjectsAdminPanel({ clientId, adminPassword }: { clientId?: string; adminPassword?: string } = {}) {
  const [isMilestoneOpen, setIsMilestoneOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ClientProject | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
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

  // Wizard state
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isClientSelectOpen, setIsClientSelectOpen] = useState(false);
  const [wizardClientId, setWizardClientId] = useState<string>("");
  const [projectComments, setProjectComments] = useState<Record<string, AdminComment[]>>({});
  const [projectUpdateRequests, setProjectUpdateRequests] = useState<Record<string, AdminUpdateRequest[]>>({});
  const [replyText, setReplyText] = useState('');
  const [replyingProjectId, setReplyingProjectId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data: projects, isLoading } = useQuery({
    queryKey: ['admin-client-projects'],
    queryFn: async () => {
      const { data: res, error } = await supabase.functions.invoke('admin', {
        body: { action: 'list', table: 'client_projects', password: adminPassword },
      });
      if (error) throw error;
      // Fetch milestones and client names separately
      const projectRows = res?.data || [];
      if (projectRows.length === 0) return [];
      
      const projectIds = projectRows.map((p: any) => p.id);
      const clientIds = [...new Set(projectRows.map((p: any) => p.client_account_id))];
      
      const [milestonesRes, clientsRes, commentsRes, requestsRes] = await Promise.all([
        supabase.functions.invoke('admin', {
          body: { action: 'list', table: 'project_milestones', password: adminPassword },
        }),
        supabase.functions.invoke('admin', {
          body: { action: 'list', table: 'client_accounts', password: adminPassword },
        }),
        supabase.from('project_comments').select('*').in('project_id', projectIds).order('created_at', { ascending: true }),
        supabase.from('project_update_requests').select('*').in('project_id', projectIds).order('created_at', { ascending: false }),
      ]);

      const milestones = milestonesRes?.data?.data || [];
      const clientAccounts = clientsRes?.data?.data || [];
      const clientMap = Object.fromEntries(clientAccounts.map((c: any) => [c.id, c.business_name]));

      // Group comments and update requests by project
      const commentsByProject: Record<string, AdminComment[]> = {};
      for (const c of (commentsRes.data || [])) {
        if (!commentsByProject[c.project_id]) commentsByProject[c.project_id] = [];
        commentsByProject[c.project_id].push(c);
      }
      const requestsByProject: Record<string, AdminUpdateRequest[]> = {};
      for (const r of (requestsRes.data || [])) {
        if (!requestsByProject[r.project_id]) requestsByProject[r.project_id] = [];
        requestsByProject[r.project_id].push(r);
      }
      setProjectComments(commentsByProject);
      setProjectUpdateRequests(requestsByProject);

      return projectRows.map((p: any) => ({
        ...p,
        client_accounts: { business_name: clientMap[p.client_account_id] || 'Unknown' },
        project_milestones: milestones.filter((m: any) => m.project_id === p.id),
      })) as ClientProject[];
    },
  });

  const { data: clients } = useQuery({
    queryKey: ['client-accounts-list'],
    queryFn: async () => {
      const { data: res, error } = await supabase.functions.invoke('admin', {
        body: { action: 'list', table: 'client_accounts', password: adminPassword },
      });
      if (error) throw error;
      return (res?.data || []) as ClientAccountWithTier[];
    },
  });


  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & typeof formData) => {
      const { error } = await supabase.functions.invoke('admin', {
        body: {
          action: 'update',
          table: 'client_projects',
          id,
          password: adminPassword,
          data: {
            client_account_id: data.client_account_id,
            name: data.name,
            description: data.description || null,
            status: data.status,
            start_date: data.start_date || null,
            target_end_date: data.target_end_date || null,
            progress_percentage: parseInt(data.progress_percentage) || 0,
          },
        },
      });
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
      const { error } = await supabase.functions.invoke('admin', {
        body: { action: 'delete', table: 'client_projects', id, password: adminPassword },
      });
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
      // Get next sort order from existing milestones in the cached data
      const existingMilestones = (projects || [])
        .find(p => p.id === projectId)?.project_milestones || [];
      const nextOrder = existingMilestones.length > 0 
        ? Math.max(...existingMilestones.map(m => m.sort_order)) + 1 
        : 1;

      const { error } = await supabase.functions.invoke('admin', {
        body: {
          action: 'create',
          table: 'project_milestones',
          password: adminPassword,
          data: {
            project_id: projectId,
            name: data.name,
            description: data.description || null,
            due_date: data.due_date || null,
            status: data.status,
            sort_order: nextOrder,
          },
        },
      });
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
      const { error } = await supabase.functions.invoke('admin', {
        body: { action: 'delete', table: 'project_milestones', id, password: adminPassword },
      });
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
    mutationFn: async ({ id, status, milestoneName, clientAccountId, projectName }: {
      id: string;
      status: string;
      milestoneName: string;
      clientAccountId: string;
      projectName: string;
    }) => {
      const { error } = await supabase
        .from('project_milestones')
        .update({
          status,
          completed_at: status === 'completed' ? new Date().toISOString() : null
        })
        .eq('id', id);

      if (error) throw error;

      if (status === 'completed') {
        await Promise.allSettled([
          supabase.from('client_notifications').insert({
            client_account_id: clientAccountId,
            notification_type: 'milestone_completed',
            title: `Milestone Complete: ${milestoneName}`,
            description: `Your team completed the "${milestoneName}" milestone on ${projectName}.`,
            priority: 'medium',
            is_positive: true,
            is_read: false,
          }),
          supabase.from('activity_feed').insert({
            client_account_id: clientAccountId,
            activity_type: 'milestone_completed',
            title: `Milestone completed: ${milestoneName}`,
            description: `Progress on "${projectName}" updated.`,
            icon: 'CheckCircle',
            metadata: { project_name: projectName, milestone_name: milestoneName },
          }),
          supabase.functions.invoke('send-client-notification', {
            body: {
              type: 'milestone_completed',
              client_account_id: clientAccountId,
              title: milestoneName,
              details: { project_name: projectName },
            },
          }),
        ]);
      }
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

  const replyCommentMutation = useMutation({
    mutationFn: async ({ projectId, clientAccountId, message }: { projectId: string; clientAccountId: string; message: string }) => {
      const { error } = await supabase.from('project_comments').insert({
        project_id: projectId,
        client_account_id: clientAccountId,
        sender_type: 'admin',
        sender_name: 'Team',
        message,
      });
      if (error) throw error;

      await Promise.allSettled([
        supabase.from('client_notifications').insert({
          client_account_id: clientAccountId,
          notification_type: 'project_comment_reply',
          title: 'New reply on your project question',
          description: message.slice(0, 120),
          priority: 'medium',
          is_positive: false,
          is_read: false,
        }),
      ]);
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin-client-projects'] });
      toast.success('Reply sent');
      setReplyText('');
      setReplyingProjectId(null);
    },
    onError: () => toast.error('Failed to send reply'),
  });

  const respondUpdateRequestMutation = useMutation({
    mutationFn: async ({ requestId, projectId, clientAccountId, response }: {
      requestId: string;
      projectId: string;
      clientAccountId: string;
      response: string;
    }) => {
      const { error } = await supabase
        .from('project_update_requests')
        .update({ response, status: 'responded', responded_at: new Date().toISOString() })
        .eq('id', requestId);
      if (error) throw error;

      await Promise.allSettled([
        supabase.from('client_notifications').insert({
          client_account_id: clientAccountId,
          notification_type: 'project_update_response',
          title: 'Your update request has been answered',
          description: response.slice(0, 120),
          priority: 'medium',
          is_positive: true,
          is_read: false,
        }),
        supabase.from('activity_feed').insert({
          client_account_id: clientAccountId,
          activity_type: 'project_update_response',
          title: 'Project update provided',
          description: response.slice(0, 120),
          icon: 'RefreshCw',
        }),
        supabase.functions.invoke('send-client-notification', {
          body: {
            type: 'project_update_response',
            client_account_id: clientAccountId,
            title: 'Project Update',
            description: response.slice(0, 300),
          },
        }),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-client-projects'] });
      toast.success('Response sent to client');
      setResponseText('');
      setRespondingRequestId(null);
    },
    onError: () => toast.error('Failed to send response'),
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
    setIsEditOpen(false);
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
    setIsEditOpen(true);
  };

  const handleOpenWizard = (preselectedClientId?: string) => {
    if (preselectedClientId || clientId) {
      setWizardClientId(preselectedClientId || clientId || '');
      setIsWizardOpen(true);
    } else {
      setIsClientSelectOpen(true);
    }
  };

  const handleSubmit = () => {
    if (!formData.client_account_id || !formData.name) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (editingProject) {
      updateMutation.mutate({ id: editingProject.id, ...formData });
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

  const displayedProjects = clientId
    ? projects?.filter((p) => p.client_account_id === clientId)
    : projects;

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
          <Button onClick={() => handleOpenWizard()}>
            <Sparkles className="h-4 w-4 mr-2" />
            Create Project
          </Button>
        </div>
      </div>

      {/* Client selector pre-step (when no clientId prop) */}
      <Dialog open={isClientSelectOpen} onOpenChange={setIsClientSelectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Select Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Select value={wizardClientId} onValueChange={setWizardClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a client…" />
              </SelectTrigger>
              <SelectContent>
                {clients?.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.business_name}
                    <Badge variant="outline" className="ml-2 text-xs">{c.tier}</Badge>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsClientSelectOpen(false)}>Cancel</Button>
              <Button
                disabled={!wizardClientId}
                onClick={() => { setIsClientSelectOpen(false); setIsWizardOpen(true); }}
              >
                Next
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
            {displayedProjects?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No projects yet. Create your first project to get started.
              </div>
            ) : (
              displayedProjects?.map((project) => (
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

                      {/* Update Requests */}
                      {(projectUpdateRequests[project.id] || []).length > 0 && (
                        <div className="mt-4 border-t pt-4">
                          <h4 className="font-medium mb-2 flex items-center gap-2">
                            <RefreshCw className="h-4 w-4 text-amber-500" />
                            Update Requests
                          </h4>
                          <div className="space-y-3">
                            {(projectUpdateRequests[project.id] || []).map((req) => (
                              <div key={req.id} className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                                    {req.status === 'responded' ? 'Responded' : req.status === 'acknowledged' ? 'Acknowledged' : 'Pending'}
                                  </span>
                                  <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}</span>
                                </div>
                                {req.message && <p className="text-sm text-foreground">{req.message}</p>}
                                {req.response && (
                                  <div className="mt-2 p-2 bg-white rounded border border-amber-100">
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Your response:</p>
                                    <p className="text-sm">{req.response}</p>
                                  </div>
                                )}
                                {req.status !== 'responded' && (
                                  respondingRequestId === req.id ? (
                                    <div className="space-y-2 mt-2">
                                      <Textarea
                                        placeholder="Write your response..."
                                        value={responseText}
                                        onChange={(e) => setResponseText(e.target.value)}
                                        rows={3}
                                        className="text-sm"
                                      />
                                      <div className="flex gap-2 justify-end">
                                        <Button variant="ghost" size="sm" onClick={() => { setRespondingRequestId(null); setResponseText(''); }}>Cancel</Button>
                                        <Button
                                          size="sm"
                                          disabled={!responseText.trim() || respondUpdateRequestMutation.isPending}
                                          onClick={() => respondUpdateRequestMutation.mutate({
                                            requestId: req.id,
                                            projectId: project.id,
                                            clientAccountId: project.client_account_id,
                                            response: responseText.trim(),
                                          })}
                                        >
                                          {respondUpdateRequestMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                                          Send Response
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <Button variant="outline" size="sm" onClick={() => setRespondingRequestId(req.id)}>
                                      <CornerDownRight className="h-3 w-3 mr-1" /> Respond
                                    </Button>
                                  )
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Comment Thread */}
                      {(projectComments[project.id] || []).length > 0 && (
                        <div className="mt-4 border-t pt-4">
                          <h4 className="font-medium mb-2 flex items-center gap-2">
                            <MessageCircle className="h-4 w-4 text-primary" />
                            Client Questions
                          </h4>
                          <div className="space-y-2 max-h-64 overflow-y-auto mb-3">
                            {(projectComments[project.id] || []).map((comment) => (
                              <div
                                key={comment.id}
                                className={`p-2.5 rounded-lg text-sm ${
                                  comment.sender_type === 'client'
                                    ? 'bg-blue-50 border border-blue-200'
                                    : 'bg-muted/50 border border-border ml-6'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-medium text-xs">
                                    {comment.sender_type === 'client' ? 'Client' : comment.sender_name || 'Team'}
                                  </span>
                                  <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}</span>
                                </div>
                                <p className="text-muted-foreground">{comment.message}</p>
                              </div>
                            ))}
                          </div>
                          {replyingProjectId === project.id ? (
                            <div className="space-y-2">
                              <Textarea
                                placeholder="Reply to client..."
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                rows={3}
                                className="text-sm"
                              />
                              <div className="flex gap-2 justify-end">
                                <Button variant="ghost" size="sm" onClick={() => { setReplyingProjectId(null); setReplyText(''); }}>Cancel</Button>
                                <Button
                                  size="sm"
                                  disabled={!replyText.trim() || replyCommentMutation.isPending}
                                  onClick={() => replyCommentMutation.mutate({
                                    projectId: project.id,
                                    clientAccountId: project.client_account_id,
                                    message: replyText.trim(),
                                  })}
                                >
                                  {replyCommentMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                                  Reply
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => setReplyingProjectId(project.id)}>
                              <CornerDownRight className="h-3 w-3 mr-1" /> Reply to Client
                            </Button>
                          )}
                        </div>
                      )}

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
                                  <Select value={milestone.status} onValueChange={(status) => updateMilestoneStatusMutation.mutate({ id: milestone.id, status, milestoneName: milestone.name, clientAccountId: project.client_account_id, projectName: project.name })}>
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

      {/* Edit Project Dialog */}
      <Dialog open={isEditOpen} onOpenChange={open => { if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Project Name *</Label>
              <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={formData.start_date} onChange={e => setFormData({ ...formData, start_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Target End Date</Label>
                <Input type="date" value={formData.target_end_date} onChange={e => setFormData({ ...formData, target_end_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={updateMutation.isPending}>Update</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Project Setup Wizard */}
      {wizardClientId && clients && (
        <ProjectSetupWizard
          open={isWizardOpen}
          onClose={() => { setIsWizardOpen(false); setWizardClientId(''); }}
          client={(() => {
            const c = clients.find(c => c.id === wizardClientId);
            return { id: wizardClientId, business_name: c?.business_name || '', tier: c?.tier || 'foundation' };
          })()}
          adminPassword={adminPassword || ''}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['admin-client-projects'] })}
        />
      )}
    </div>
  );
}
