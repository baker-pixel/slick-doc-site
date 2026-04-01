import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, FileText, Trash2, Upload, Download, Edit } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface ServiceAgreement {
  id: string;
  client_account_id: string;
  title: string;
  description: string | null;
  agreement_type: string;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  status: string;
  effective_date: string | null;
  expiration_date: string | null;
  signed_at: string | null;
  created_at: string;
  client_accounts?: { business_name: string };
}

interface ClientAccount {
  id: string;
  business_name: string;
}

export function ServiceAgreementsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingAgreement, setEditingAgreement] = useState<ServiceAgreement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    client_account_id: '',
    title: '',
    description: '',
    agreement_type: 'contract',
    status: 'active',
    effective_date: '',
    expiration_date: '',
  });
  const queryClient = useQueryClient();

  const { data: agreements, isLoading } = useQuery({
    queryKey: ['admin-service-agreements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_agreements')
        .select('*, client_accounts(business_name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ServiceAgreement[];
    },
  });

  const { data: clients } = useQuery({
    queryKey: ['client-accounts-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_accounts')
        .select('id, business_name')
        .order('business_name');

      if (error) throw error;
      return data as ClientAccount[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData & { file_url?: string; file_name?: string; file_size?: number }) => {
      const { error } = await supabase
        .from('service_agreements')
        .insert([{
          ...data,
          effective_date: data.effective_date || null,
          expiration_date: data.expiration_date || null,
        }]);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-service-agreements'] });
      toast.success("Agreement created successfully");
      resetForm();
    },
    onError: (error) => {
      console.error('Create error:', error);
      toast.error("Failed to create agreement");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<typeof formData> & { file_url?: string; file_name?: string; file_size?: number }) => {
      const { error } = await supabase
        .from('service_agreements')
        .update({
          ...data,
          effective_date: data.effective_date || null,
          expiration_date: data.expiration_date || null,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-service-agreements'] });
      toast.success("Agreement updated successfully");
      resetForm();
    },
    onError: (error) => {
      console.error('Update error:', error);
      toast.error("Failed to update agreement");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('service_agreements')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-service-agreements'] });
      toast.success("Agreement deleted successfully");
    },
    onError: (error) => {
      console.error('Delete error:', error);
      toast.error("Failed to delete agreement");
    },
  });

  const resetForm = () => {
    setFormData({
      client_account_id: '',
      title: '',
      description: '',
      agreement_type: 'contract',
      status: 'active',
      effective_date: '',
      expiration_date: '',
    });
    setSelectedFile(null);
    setEditingAgreement(null);
    setIsOpen(false);
  };

  const handleEdit = (agreement: ServiceAgreement) => {
    setEditingAgreement(agreement);
    setFormData({
      client_account_id: agreement.client_account_id,
      title: agreement.title,
      description: agreement.description || '',
      agreement_type: agreement.agreement_type,
      status: agreement.status,
      effective_date: agreement.effective_date || '',
      expiration_date: agreement.expiration_date || '',
    });
    setIsOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.client_account_id || !formData.title) {
      toast.error("Please fill in all required fields");
      return;
    }

    let fileData: { file_url?: string; file_name?: string; file_size?: number } = {};

    if (selectedFile) {
      const filePath = `${formData.client_account_id}/${Date.now()}-${selectedFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from('service-agreements')
        .upload(filePath, selectedFile);

      if (uploadError) {
        toast.error("Failed to upload file");
        return;
      }

      fileData = {
        file_url: filePath,
        file_name: selectedFile.name,
        file_size: selectedFile.size,
      };
    }

    if (editingAgreement) {
      updateMutation.mutate({ id: editingAgreement.id, ...formData, ...fileData });
    } else {
      createMutation.mutate({ ...formData, ...fileData });
    }
  };

  const handleDownload = async (agreement: ServiceAgreement) => {
    if (!agreement.file_url) return;

    try {
      const { data, error } = await supabase.storage
        .from('service-agreements')
        .download(agreement.file_url);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = agreement.file_name || 'agreement.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      toast.error("Failed to download file");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Active</Badge>;
      case 'expired':
        return <Badge variant="secondary">Expired</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Pending</Badge>;
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Service Agreements</h2>
          <p className="text-muted-foreground">Manage client contracts and scope of work documents.</p>
        </div>
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsOpen(open); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Agreement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingAgreement ? 'Edit Agreement' : 'Add New Agreement'}</DialogTitle>
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
                <Label>Title *</Label>
                <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="e.g., Marketing Services Agreement" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Brief description of the agreement" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Agreement Type</Label>
                  <Select value={formData.agreement_type} onValueChange={(v) => setFormData({ ...formData, agreement_type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contract">Service Contract</SelectItem>
                      <SelectItem value="sow">Scope of Work</SelectItem>
                      <SelectItem value="nda">Non-Disclosure Agreement</SelectItem>
                      <SelectItem value="addendum">Contract Addendum</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Effective Date</Label>
                  <Input type="date" value={formData.effective_date} onChange={(e) => setFormData({ ...formData, effective_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Expiration Date</Label>
                  <Input type="date" value={formData.expiration_date} onChange={(e) => setFormData({ ...formData, expiration_date: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Upload Document</Label>
                <Input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                {editingAgreement?.file_name && !selectedFile && (
                  <p className="text-sm text-muted-foreground">Current file: {editingAgreement.file_name}</p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={resetForm}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingAgreement ? 'Update' : 'Create'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agreements?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No agreements found. Add your first agreement to get started.
                  </TableCell>
                </TableRow>
              ) : (
                agreements?.map((agreement) => (
                  <TableRow key={agreement.id}>
                    <TableCell className="font-medium">{agreement.client_accounts?.business_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {agreement.title}
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">{agreement.agreement_type}</TableCell>
                    <TableCell>{getStatusBadge(agreement.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {agreement.effective_date && <div>From: {format(new Date(agreement.effective_date), 'MMM d, yyyy')}</div>}
                      {agreement.expiration_date && <div>To: {format(new Date(agreement.expiration_date), 'MMM d, yyyy')}</div>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {agreement.file_url && (
                          <Button variant="ghost" size="icon" onClick={() => handleDownload(agreement)}>
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(agreement)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(agreement.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
