import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Eye, EyeOff, Trash2, Edit, Globe, BarChart3, Share2, Mail, MoreHorizontal } from "lucide-react";

interface ClientAccessTabProps {
  clientAccountId: string;
}

interface PlatformCredential {
  id: string;
  platform_type: string;
  platform_name: string;
  login_url: string | null;
  username: string | null;
  password: string | null;
  additional_info: Record<string, string> | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const PLATFORM_TYPES = [
  { value: "social_media", label: "Social Media", icon: Share2 },
  { value: "analytics", label: "Analytics", icon: BarChart3 },
  { value: "website", label: "Website / CMS", icon: Globe },
  { value: "email", label: "Email Marketing", icon: Mail },
  { value: "other", label: "Other", icon: MoreHorizontal },
];

const PLATFORM_PRESETS: Record<string, string[]> = {
  social_media: ["Facebook", "Instagram", "LinkedIn", "X (Twitter)", "TikTok", "YouTube", "Pinterest"],
  analytics: ["Google Analytics", "Google Search Console", "Google Tag Manager", "Meta Business Suite", "Hotjar"],
  website: ["WordPress", "Squarespace", "Wix", "Shopify", "Webflow", "GoDaddy", "Hosting Provider"],
  email: ["Mailchimp", "Constant Contact", "HubSpot", "Klaviyo", "ActiveCampaign"],
  other: ["Other"],
};

export function ClientAccessTab({ clientAccountId }: ClientAccessTabProps) {
  const [credentials, setCredentials] = useState<PlatformCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  
  const [form, setForm] = useState({
    platform_type: "",
    platform_name: "",
    login_url: "",
    username: "",
    password: "",
    notes: "",
  });

  useEffect(() => {
    fetchCredentials();
  }, [clientAccountId]);

  const fetchCredentials = async () => {
    try {
      const { data, error } = await supabase
        .from("client_platform_credentials")
        .select("*")
        .eq("client_account_id", clientAccountId)
        .order("platform_type", { ascending: true });

      if (error) throw error;
      setCredentials((data || []) as PlatformCredential[]);
    } catch (error) {
      console.error("Error fetching credentials:", error);
      toast.error("Failed to load credentials");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      platform_type: "",
      platform_name: "",
      login_url: "",
      username: "",
      password: "",
      notes: "",
    });
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!form.platform_type || !form.platform_name) {
      toast.error("Please select a platform type and name");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from("client_platform_credentials")
          .update({
            platform_type: form.platform_type,
            platform_name: form.platform_name,
            login_url: form.login_url || null,
            username: form.username || null,
            password: form.password || null,
            notes: form.notes || null,
          })
          .eq("id", editingId);

        if (error) throw error;
        toast.success("Credentials updated");
      } else {
        const { error } = await supabase
          .from("client_platform_credentials")
          .insert({
            client_account_id: clientAccountId,
            platform_type: form.platform_type,
            platform_name: form.platform_name,
            login_url: form.login_url || null,
            username: form.username || null,
            password: form.password || null,
            notes: form.notes || null,
          });

        if (error) throw error;
        toast.success("Credentials added");
      }

      setDialogOpen(false);
      resetForm();
      fetchCredentials();
    } catch (error) {
      console.error("Error saving credentials:", error);
      toast.error("Failed to save credentials");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (credential: PlatformCredential) => {
    setForm({
      platform_type: credential.platform_type,
      platform_name: credential.platform_name,
      login_url: credential.login_url || "",
      username: credential.username || "",
      password: credential.password || "",
      notes: credential.notes || "",
    });
    setEditingId(credential.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete these credentials?")) return;

    try {
      const { error } = await supabase
        .from("client_platform_credentials")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Credentials deleted");
      fetchCredentials();
    } catch (error) {
      console.error("Error deleting credentials:", error);
      toast.error("Failed to delete credentials");
    }
  };

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getTypeIcon = (type: string) => {
    const found = PLATFORM_TYPES.find(t => t.value === type);
    return found ? found.icon : MoreHorizontal;
  };

  const groupedCredentials = credentials.reduce((acc, cred) => {
    if (!acc[cred.platform_type]) {
      acc[cred.platform_type] = [];
    }
    acc[cred.platform_type].push(cred);
    return acc;
  }, {} as Record<string, PlatformCredential[]>);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-32 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Platform Access</h2>
          <p className="text-muted-foreground">
            Share your login credentials securely so we can manage your accounts
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Credentials
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit" : "Add"} Platform Credentials</DialogTitle>
              <DialogDescription>
                Enter your login details for the platform you'd like us to manage.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Platform Type *</Label>
                <Select
                  value={form.platform_type}
                  onValueChange={(value) => setForm({ ...form, platform_type: value, platform_name: "" })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {form.platform_type && (
                <div className="space-y-2">
                  <Label>Platform *</Label>
                  <Select
                    value={form.platform_name}
                    onValueChange={(value) => setForm({ ...form, platform_name: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select platform..." />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORM_PRESETS[form.platform_type]?.map((platform) => (
                        <SelectItem key={platform} value={platform}>
                          {platform}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Login URL</Label>
                <Input
                  placeholder="https://..."
                  value={form.login_url}
                  onChange={(e) => setForm({ ...form, login_url: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Username / Email</Label>
                <Input
                  placeholder="Enter username or email"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  placeholder="Enter password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Any additional info (2FA backup codes, admin URL, etc.)"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : editingId ? "Update" : "Add"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {credentials.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Share2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No credentials added yet</h3>
            <p className="text-muted-foreground mb-4 max-w-sm">
              Add your social media, analytics, and website login info so our team can manage your accounts.
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Credential
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {PLATFORM_TYPES.map((type) => {
            const items = groupedCredentials[type.value];
            if (!items || items.length === 0) return null;

            const Icon = type.icon;

            return (
              <Card key={type.value}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Icon className="h-5 w-5" />
                    {type.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {items.map((cred) => (
                    <div
                      key={cred.id}
                      className="flex items-start justify-between p-4 rounded-lg border bg-card"
                    >
                      <div className="space-y-1 flex-1">
                        <h4 className="font-medium">{cred.platform_name}</h4>
                        {cred.login_url && (
                          <p className="text-sm text-muted-foreground">
                            <a href={cred.login_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                              {cred.login_url}
                            </a>
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-4 mt-2">
                          {cred.username && (
                            <div>
                              <span className="text-xs text-muted-foreground">Username</span>
                              <p className="text-sm font-mono">{cred.username}</p>
                            </div>
                          )}
                          {cred.password && (
                            <div>
                              <span className="text-xs text-muted-foreground">Password</span>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-mono">
                                  {visiblePasswords.has(cred.id) ? cred.password : "••••••••"}
                                </p>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => togglePasswordVisibility(cred.id)}
                                >
                                  {visiblePasswords.has(cred.id) ? (
                                    <EyeOff className="h-3 w-3" />
                                  ) : (
                                    <Eye className="h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                        {cred.notes && (
                          <p className="text-sm text-muted-foreground mt-2">{cred.notes}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(cred)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(cred.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
