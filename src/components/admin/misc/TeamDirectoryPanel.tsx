import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import { Plus, Pencil, Trash2, Users, Upload, X } from "lucide-react";

interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  bio: string | null;
  specialties: string[] | null;
  is_active: boolean;
  display_order: number;
}

interface TeamDirectoryPanelProps {
  adminPassword: string;
}

export default function TeamDirectoryPanel({ adminPassword }: TeamDirectoryPanelProps) {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    role: "",
    email: "",
    phone: "",
    bio: "",
    specialties: "",
    is_active: true,
    display_order: 0,
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: teamMembers, isLoading, isError } = useQuery({
    queryKey: ["admin-team-members"],
    queryFn: async () => {
      const response = await supabase.functions.invoke("admin", {
        body: { action: "list_team_members", password: adminPassword },
      });
      if (response.error) throw response.error;
      return response.data.data as TeamMember[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData & { photo_url?: string }) => {
      const response = await supabase.functions.invoke("admin", {
        body: {
          action: "create_team_member",
          password: adminPassword,
          data: {
            ...data,
            specialties: data.specialties ? data.specialties.split(",").map((s) => s.trim()) : [],
          },
        },
      });
      if (response.error) {
        const msg = await getEdgeErrorMessage(response.error, response.data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Something went wrong");
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-team-members"] });
      toast({ title: "Team member added" });
      resetForm();
    },
    onError: (error) => {
      toast({ title: "Error adding team member", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData & { photo_url?: string } }) => {
      const response = await supabase.functions.invoke("admin", {
        body: {
          action: "update_team_member",
          password: adminPassword,
          id,
          data: {
            ...data,
            specialties: data.specialties ? data.specialties.split(",").map((s) => s.trim()) : [],
          },
        },
      });
      if (response.error) {
        const msg = await getEdgeErrorMessage(response.error, response.data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Something went wrong");
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-team-members"] });
      toast({ title: "Team member updated" });
      resetForm();
    },
    onError: (error) => {
      toast({ title: "Error updating team member", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await supabase.functions.invoke("admin", {
        body: { action: "delete_team_member", password: adminPassword, id },
      });
      if (response.error) {
        const msg = await getEdgeErrorMessage(response.error, response.data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Something went wrong");
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-team-members"] });
      toast({ title: "Team member deleted" });
    },
    onError: (error) => {
      toast({ title: "Error deleting team member", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      role: "",
      email: "",
      phone: "",
      bio: "",
      specialties: "",
      is_active: true,
      display_order: 0,
    });
    setPhotoFile(null);
    setEditingMember(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (member: TeamMember) => {
    setEditingMember(member);
    setFormData({
      name: member.name,
      role: member.role,
      email: member.email || "",
      phone: member.phone || "",
      bio: member.bio || "",
      specialties: member.specialties?.join(", ") || "",
      is_active: member.is_active,
      display_order: member.display_order,
    });
    setIsDialogOpen(true);
  };

  const uploadPhoto = async (): Promise<string | null> => {
    if (!photoFile) return editingMember?.photo_url || null;

    setUploading(true);
    try {
      const fileExt = photoFile.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("team-photos")
        .upload(fileName, photoFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("team-photos")
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error) {
      console.error("Photo upload error:", error);
      toast({ title: "Error uploading photo", variant: "destructive" });
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const photo_url = await uploadPhoto();
    const submitData = { ...formData, photo_url: photo_url || undefined };

    if (editingMember) {
      updateMutation.mutate({ id: editingMember.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const getInitials = (name: string) => {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Team Directory</h2>
          <p className="text-muted-foreground">Manage agency team members visible to clients</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Team Member
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingMember ? "Edit" : "Add"} Team Member</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role *</Label>
                  <Input
                    id="role"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="photo">Photo</Label>
                <div className="flex items-center gap-4">
                  {(photoFile || editingMember?.photo_url) && (
                    <Avatar className="h-12 w-12">
                      <AvatarImage
                        src={photoFile ? URL.createObjectURL(photoFile) : editingMember?.photo_url || undefined}
                      />
                      <AvatarFallback>{formData.name ? getInitials(formData.name) : "?"}</AvatarFallback>
                    </Avatar>
                  )}
                  <Input
                    id="photo"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="specialties">Specialties (comma-separated)</Label>
                <Input
                  id="specialties"
                  value={formData.specialties}
                  onChange={(e) => setFormData({ ...formData, specialties: e.target.value })}
                  placeholder="SEO, Content Marketing, PPC"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="display_order">Display Order</Label>
                  <Input
                    id="display_order"
                    type="number"
                    value={formData.display_order}
                    onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label htmlFor="is_active">Active</Label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="submit" disabled={uploading || createMutation.isPending || updateMutation.isPending}>
                  {uploading ? "Uploading..." : editingMember ? "Update" : "Add"} Member
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-destructive text-center py-8">Failed to load team members.</p>
          </CardContent>
        </Card>
      ) : !teamMembers || teamMembers.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No team members yet</p>
              <p className="text-sm">Add your first team member to get started.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teamMembers.map((member) => (
            <Card key={member.id} className={!member.is_active ? "opacity-60" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <Avatar className="h-14 w-14">
                    <AvatarImage src={member.photo_url || undefined} alt={member.name} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {getInitials(member.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-foreground">{member.name}</h3>
                        <p className="text-sm text-muted-foreground">{member.role}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => handleEdit(member)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Delete this team member?")) {
                              deleteMutation.mutate(member.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {!member.is_active && (
                      <Badge variant="secondary" className="mt-1">Inactive</Badge>
                    )}
                    {member.specialties && member.specialties.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {member.specialties.slice(0, 3).map((s, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
