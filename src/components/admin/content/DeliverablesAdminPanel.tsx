import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Package, Star, Eye, Download } from "lucide-react";
import { format } from "date-fns";

interface Deliverable {
  id: string;
  client_account_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  category: string;
  file_url: string | null;
  file_name: string | null;
  preview_url: string | null;
  status: string;
  submitted_at: string;
  reviewed_at: string | null;
  rating: number | null;
  feedback: string | null;
  revision_notes: string | null;
  revision_count: number;
}

interface ClientAccount {
  id: string;
  business_name: string;
}

interface DeliverablesAdminPanelProps {
  adminPassword: string;
  clientId?: string;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending_review: { label: "Pending Review", variant: "secondary" },
  approved: { label: "Approved", variant: "default" },
  revision_requested: { label: "Revision Requested", variant: "destructive" },
  rejected: { label: "Rejected", variant: "outline" },
};

const categories = ["general", "design", "content", "development", "marketing", "report", "video", "other"];

export default function DeliverablesAdminPanel({ adminPassword, clientId }: DeliverablesAdminPanelProps) {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDeliverable, setEditingDeliverable] = useState<Deliverable | null>(null);
  const [formData, setFormData] = useState({
    client_account_id: "",
    title: "",
    description: "",
    category: "general",
    file_url: "",
    file_name: "",
    preview_url: "",
  });
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: deliverables, isLoading } = useQuery({
    queryKey: ["admin-deliverables"],
    queryFn: async () => {
      const response = await supabase.functions.invoke("admin", {
        body: { action: "list_deliverables", password: adminPassword },
      });
      if (response.error) throw response.error;
      return response.data.data as Deliverable[];
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["admin-clients-list"],
    queryFn: async () => {
      const response = await supabase.functions.invoke("admin", {
        body: { action: "list", table: "client_accounts", password: adminPassword },
      });
      if (response.error) throw response.error;
      return response.data.data as ClientAccount[];
    },
  });

  const sendNotification = async (clientId: string, title: string, description: string, category: string) => {
    try {
      await supabase.functions.invoke("send-client-notification", {
        body: {
          type: "deliverable",
          client_account_id: clientId,
          title,
          description,
          details: { category },
          password: adminPassword,
        },
      });
      toast({ title: "Notification sent to client" });
    } catch (error) {
      console.error("Failed to send notification:", error);
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await supabase.functions.invoke("admin", {
        body: { action: "create_deliverable", password: adminPassword, data },
      });
      if (response.error) throw response.error;
      return { response: response.data, data };
    },
    onSuccess: ({ data }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-deliverables"] });
      toast({ title: "Deliverable created" });
      sendNotification(data.client_account_id, data.title, data.description, data.category);
      resetForm();
    },
    onError: (error) => {
      toast({ title: "Error creating deliverable", description: String(error), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Deliverable> }) => {
      const response = await supabase.functions.invoke("admin", {
        body: { action: "update_deliverable", password: adminPassword, id, data },
      });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-deliverables"] });
      toast({ title: "Deliverable updated" });
      resetForm();
    },
    onError: (error) => {
      toast({ title: "Error updating deliverable", description: String(error), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await supabase.functions.invoke("admin", {
        body: { action: "delete_deliverable", password: adminPassword, id },
      });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-deliverables"] });
      toast({ title: "Deliverable deleted" });
    },
    onError: (error) => {
      toast({ title: "Error deleting deliverable", description: String(error), variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      client_account_id: "",
      title: "",
      description: "",
      category: "general",
      file_url: "",
      file_name: "",
      preview_url: "",
    });
    setEditingDeliverable(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (deliverable: Deliverable) => {
    setEditingDeliverable(deliverable);
    setFormData({
      client_account_id: deliverable.client_account_id,
      title: deliverable.title,
      description: deliverable.description || "",
      category: deliverable.category,
      file_url: deliverable.file_url || "",
      file_name: deliverable.file_name || "",
      preview_url: deliverable.preview_url || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingDeliverable) {
      updateMutation.mutate({ id: editingDeliverable.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const filteredDeliverables = deliverables?.filter(
    (d) =>
      (statusFilter === "all" || d.status === statusFilter) &&
      (!clientId || d.client_account_id === clientId)
  );

  const getClientName = (clientId: string) => {
    return clients?.find((c) => c.id === clientId)?.business_name || "Unknown";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Deliverables</h2>
          <p className="text-muted-foreground">Manage client deliverables and track reviews</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending_review">Pending Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="revision_requested">Revision Requested</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => resetForm()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Deliverable
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingDeliverable ? "Edit" : "Add"} Deliverable</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="client">Client *</Label>
                  <Select
                    value={formData.client_account_id}
                    onValueChange={(value) => setFormData({ ...formData, client_account_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients?.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.business_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value) => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat} value={cat} className="capitalize">
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="file_name">File Name</Label>
                    <Input
                      id="file_name"
                      value={formData.file_name}
                      onChange={(e) => setFormData({ ...formData, file_name: e.target.value })}
                      placeholder="report.pdf"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="file_url">File URL</Label>
                  <Input
                    id="file_url"
                    value={formData.file_url}
                    onChange={(e) => setFormData({ ...formData, file_url: e.target.value })}
                    placeholder="https://..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="preview_url">Preview URL</Label>
                  <Input
                    id="preview_url"
                    value={formData.preview_url}
                    onChange={(e) => setFormData({ ...formData, preview_url: e.target.value })}
                    placeholder="https://..."
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {editingDeliverable ? "Update" : "Create"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          </CardContent>
        </Card>
      ) : !filteredDeliverables || filteredDeliverables.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No deliverables yet</p>
              <p className="text-sm">Create your first deliverable to get started.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredDeliverables.map((deliverable) => {
            const config = statusConfig[deliverable.status] || statusConfig.pending_review;

            return (
              <Card key={deliverable.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-foreground">{deliverable.title}</h3>
                        <Badge variant={config.variant}>{config.label}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {getClientName(deliverable.client_account_id)}
                      </p>
                      {deliverable.description && (
                        <p className="text-sm text-muted-foreground mb-2">{deliverable.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Submitted {format(new Date(deliverable.submitted_at), "MMM d, yyyy")}</span>
                        <Badge variant="outline" className="text-xs capitalize">{deliverable.category}</Badge>
                      </div>
                      {deliverable.rating && (
                        <div className="flex items-center gap-1 mt-2">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-4 w-4 ${star <= deliverable.rating! ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
                            />
                          ))}
                          {deliverable.feedback && (
                            <span className="ml-2 text-sm text-muted-foreground">"{deliverable.feedback}"</span>
                          )}
                        </div>
                      )}
                      {deliverable.revision_notes && (
                        <p className="text-sm text-destructive mt-2">
                          Revision requested: {deliverable.revision_notes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {deliverable.preview_url && (
                        <Button variant="outline" size="icon" asChild>
                          <a href={deliverable.preview_url} target="_blank" rel="noopener noreferrer">
                            <Eye className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      {deliverable.file_url && (
                        <Button variant="outline" size="icon" asChild>
                          <a href={deliverable.file_url} download={deliverable.file_name}>
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(deliverable)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Delete this deliverable?")) {
                            deleteMutation.mutate(deliverable.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
