import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import {
  Plus, Edit, Trash2, Loader2, Link2, CheckCircle, XCircle,
  Database, Mail, BarChart3, Target, MessageSquare, Search, Eye, EyeOff
} from "lucide-react";

interface IntegrationConfig {
  id: string;
  integration_type: string;
  name: string;
  api_key_encrypted: string | null;
  settings: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

const INTEGRATION_TYPES = [
  { value: "gohighlevel", label: "GoHighLevel CRM", icon: Database },
  { value: "google_analytics", label: "Google Analytics", icon: BarChart3 },
  { value: "google_ads", label: "Google Ads", icon: Target },
  { value: "facebook_ads", label: "Facebook Ads", icon: Target },
  { value: "resend", label: "Resend (Email)", icon: Mail },
  { value: "twilio", label: "Twilio (SMS)", icon: MessageSquare },
  { value: "semrush", label: "SEMrush (SEO)", icon: Search },
  { value: "ahrefs", label: "Ahrefs (SEO)", icon: Search },
  { value: "zapier", label: "Zapier", icon: Link2 },
];

export function IntegrationConfigPanel() {
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<IntegrationConfig | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  const [formData, setFormData] = useState({
    integration_type: "gohighlevel",
    name: "",
    api_key: "",
    settings: "{}",
    is_active: true,
  });

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const fetchIntegrations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("integration_configs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to fetch integrations");
      console.error(error);
    } else {
      setIntegrations((data || []) as IntegrationConfig[]);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!formData.name) {
      toast.error("Name is required");
      return;
    }

    let settings = {};
    try {
      settings = JSON.parse(formData.settings);
    } catch {
      toast.error("Invalid JSON in settings");
      return;
    }

    const payload = {
      integration_type: formData.integration_type,
      name: formData.name,
      api_key_encrypted: formData.api_key || null,
      settings,
      is_active: formData.is_active,
    };

    if (editingIntegration) {
      const { error } = await supabase
        .from("integration_configs")
        .update(payload)
        .eq("id", editingIntegration.id);

      if (error) {
        toast.error("Failed to update integration");
      } else {
        toast.success("Integration updated");
        fetchIntegrations();
      }
    } else {
      const { error } = await supabase
        .from("integration_configs")
        .insert(payload);

      if (error) {
        toast.error("Failed to create integration");
      } else {
        toast.success("Integration created");
        fetchIntegrations();
      }
    }

    setDialogOpen(false);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("integration_configs")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Failed to delete integration");
    } else {
      toast.success("Integration deleted");
      fetchIntegrations();
    }
  };

  const testConnection = async (integration: IntegrationConfig) => {
    setTestingId(integration.id);
    try {
      const { data, error } = await supabase.functions.invoke("test-api-key", {
        body: {
          integrationType: integration.integration_type,
          apiKey: integration.api_key_encrypted,
        },
      });

      if (error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Test failed");
      }

      if (data?.success) {
        toast.success("Connection successful!");
      } else {
        toast.error(data?.error || "Connection failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setTestingId(null);
    }
  };

  const openEditDialog = (integration: IntegrationConfig) => {
    setEditingIntegration(integration);
    setFormData({
      integration_type: integration.integration_type,
      name: integration.name,
      api_key: "", // Don't show existing API key
      settings: JSON.stringify(integration.settings, null, 2),
      is_active: integration.is_active,
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingIntegration(null);
    setFormData({
      integration_type: "gohighlevel",
      name: "",
      api_key: "",
      settings: "{}",
      is_active: true,
    });
  };

  const getIntegrationIcon = (type: string) => {
    const integration = INTEGRATION_TYPES.find(i => i.value === type);
    const Icon = integration?.icon || Link2;
    return <Icon className="h-4 w-4" />;
  };

  const getIntegrationLabel = (type: string) => {
    return INTEGRATION_TYPES.find(i => i.value === type)?.label || type;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Integration Configs
        </CardTitle>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Integration
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingIntegration ? "Edit Integration" : "Add Integration"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Integration Type</Label>
                <Select 
                  value={formData.integration_type} 
                  onValueChange={(v) => setFormData({ ...formData, integration_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTEGRATION_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <type.icon className="h-4 w-4" />
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Main GHL Account"
                />
              </div>
              <div className="space-y-2">
                <Label>API Key {editingIntegration && "(leave blank to keep existing)"}</Label>
                <div className="relative">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    value={formData.api_key}
                    onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                    placeholder="Enter API key"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(v => !v)}
                    className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Settings (JSON)</Label>
                <Textarea
                  value={formData.settings}
                  onChange={(e) => setFormData({ ...formData, settings: e.target.value })}
                  placeholder='{"locationId": "xxx", "workflows": {}}'
                  rows={4}
                  className="font-mono text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
                />
                <Label>Active</Label>
              </div>
              <Button onClick={handleSave} className="w-full">
                {editingIntegration ? "Update Integration" : "Create Integration"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : integrations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No integrations configured. Add API connections to enable automation.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Integration</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>API Key</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {integrations.map((integration) => (
                <TableRow key={integration.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getIntegrationIcon(integration.integration_type)}
                      {getIntegrationLabel(integration.integration_type)}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{integration.name}</TableCell>
                  <TableCell>
                    {integration.is_active ? (
                      <Badge className="bg-green-500">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline">
                        <XCircle className="h-3 w-3 mr-1" />
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {integration.api_key_encrypted ? (
                      <span className="text-sm text-muted-foreground">••••••••</span>
                    ) : (
                      <span className="text-sm text-yellow-500">Not set</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => testConnection(integration)}
                        disabled={testingId === integration.id || !integration.api_key_encrypted}
                      >
                        {testingId === integration.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Test"
                        )}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEditDialog(integration)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(integration.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}