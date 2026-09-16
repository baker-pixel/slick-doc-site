import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Edit, BarChart3, RefreshCw, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";

interface ClientAccount {
  id: string;
  business_name: string;
  ga4_property_id?: string | null;
}

interface ClientAnalytics {
  id: string;
  client_account_id: string;
  period_start: string;
  period_end: string;
  metrics: Record<string, number>;
  highlights: { items?: string[] } | null;
  created_at: string;
  client_accounts?: { business_name: string };
}

export function ClientAnalyticsAdminPanel({ clientId }: { clientId?: string } = {}) {
  const { adminPassword } = useAdminAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [editingAnalytics, setEditingAnalytics] = useState<ClientAnalytics | null>(null);
  const [formData, setFormData] = useState({
    client_account_id: clientId ?? '',
    period_start: '',
    period_end: '',
    website_visits: '',
    leads_generated: '',
    email_opens: '',
    email_clicks: '',
    social_reach: '',
    conversions: '',
    highlights: '',
  });
  const queryClient = useQueryClient();

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['admin-client-analytics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_analytics')
        .select('*, client_accounts(business_name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ClientAnalytics[];
    },
  });

  const { data: clients } = useQuery({
    queryKey: ['client-accounts-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_accounts')
        .select('id, business_name, ga4_property_id')
        .order('business_name');

      if (error) throw error;
      return data as ClientAccount[];
    },
  });

  const selectedClient = clientId ? clients?.find((c) => c.id === clientId) : undefined;
  const [ga4Input, setGa4Input] = useState('');
  const [savingGa4, setSavingGa4] = useState(false);
  const [syncingGa4, setSyncingGa4] = useState(false);
  const [syncingEngagement, setSyncingEngagement] = useState(false);

  useEffect(() => {
    setGa4Input(selectedClient?.ga4_property_id || '');
  }, [selectedClient?.ga4_property_id]);

  const saveGa4PropertyId = async () => {
    if (!clientId) return;
    setSavingGa4(true);
    const { error } = await supabase
      .from('client_accounts')
      .update({ ga4_property_id: ga4Input.trim() || null })
      .eq('id', clientId);
    setSavingGa4(false);
    if (error) {
      toast.error("Failed to save GA4 property ID");
      return;
    }
    toast.success("GA4 property ID saved");
    queryClient.invalidateQueries({ queryKey: ['client-accounts-list'] });
  };

  const syncGa4Now = async () => {
    if (!clientId) return;
    setSyncingGa4(true);
    const res = await supabase.functions.invoke("sync-ga4-analytics", {
      body: { client_id: clientId, password: adminPassword },
    });
    const outcome = res.data?.results?.[clientId];
    if (!res.error && !res.data?.error && !outcome?.startsWith("error")) {
      toast.success("Traffic synced from GA4", { description: outcome ?? "Done" });
      queryClient.invalidateQueries({ queryKey: ['admin-client-analytics'] });
    } else {
      const msg = await getEdgeErrorMessage(res.error, res.data) ?? outcome;
      toast.error("GA4 sync failed", { description: msg ? friendlyEdgeMessage(msg) : "Something went wrong" });
    }
    setSyncingGa4(false);
  };

  // Pulls real leads/opens/clicks for the selected client+period from
  // prospects (created_at/opened_at/clicked_at) instead of relying on
  // whatever an admin guesses -- see admin/index.ts::get_client_engagement_stats.
  const syncRealEngagement = async () => {
    if (!formData.client_account_id || !formData.period_start || !formData.period_end) {
      toast.error("Select a client and both period dates first");
      return;
    }
    setSyncingEngagement(true);
    const res = await supabase.functions.invoke("admin", {
      body: {
        action: "get_client_engagement_stats",
        password: adminPassword,
        data: {
          client_id: formData.client_account_id,
          period_start: formData.period_start,
          period_end: formData.period_end,
        },
      },
    });
    setSyncingEngagement(false);
    if (res.error || res.data?.error) {
      const msg = await getEdgeErrorMessage(res.error, res.data);
      toast.error("Failed to pull real numbers", { description: msg ? friendlyEdgeMessage(msg) : undefined });
      return;
    }
    const stats = res.data?.data;
    setFormData((f) => ({
      ...f,
      leads_generated: String(stats?.leads_generated ?? 0),
      email_opens: String(stats?.email_opens ?? 0),
      email_clicks: String(stats?.email_clicks ?? 0),
    }));
    toast.success("Pulled real leads/opens/clicks for this period");
  };

  const sendNotification = async (clientId: string, periodStart: string, periodEnd: string, metrics: Record<string, number>) => {
    try {
      const period = `${format(new Date(periodStart), 'MMM d')} - ${format(new Date(periodEnd), 'MMM d, yyyy')}`;
      await supabase.functions.invoke("send-client-notification", {
        body: {
          type: "analytics",
          client_account_id: clientId,
          title: `Performance Report (${period})`,
          details: { 
            period,
            website_visits: metrics.website_visits,
            leads_generated: metrics.leads_generated,
            conversions: metrics.conversions,
          },
          password: adminPassword,
        },
      });
      toast.success("Notification sent to client");
    } catch (error) {
      console.error("Failed to send notification:", error);
      toast.error(error instanceof Error ? error.message : "Failed to send notification");
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const metrics = {
        website_visits: parseInt(data.website_visits) || 0,
        leads_generated: parseInt(data.leads_generated) || 0,
        email_opens: parseInt(data.email_opens) || 0,
        email_clicks: parseInt(data.email_clicks) || 0,
        social_reach: parseInt(data.social_reach) || 0,
        conversions: parseInt(data.conversions) || 0,
      };
      const highlights = data.highlights ? { items: data.highlights.split('\n').filter(h => h.trim()) } : null;

      const { error } = await supabase
        .from('client_analytics')
        .insert([{
          client_account_id: data.client_account_id,
          period_start: data.period_start,
          period_end: data.period_end,
          metrics,
          highlights,
        }]);

      if (error) throw error;
      return { data, metrics };
    },
    onSuccess: ({ data, metrics }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-client-analytics'] });
      toast.success("Analytics snapshot created");
      sendNotification(data.client_account_id, data.period_start, data.period_end, metrics);
      resetForm();
    },
    onError: (error) => {
      console.error('Create error:', error);
      toast.error(error instanceof Error ? error.message : "Failed to create analytics");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & typeof formData) => {
      const metrics = {
        website_visits: parseInt(data.website_visits) || 0,
        leads_generated: parseInt(data.leads_generated) || 0,
        email_opens: parseInt(data.email_opens) || 0,
        email_clicks: parseInt(data.email_clicks) || 0,
        social_reach: parseInt(data.social_reach) || 0,
        conversions: parseInt(data.conversions) || 0,
      };
      const highlights = data.highlights ? { items: data.highlights.split('\n').filter(h => h.trim()) } : null;

      const { error } = await supabase
        .from('client_analytics')
        .update({
          client_account_id: data.client_account_id,
          period_start: data.period_start,
          period_end: data.period_end,
          metrics,
          highlights,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-client-analytics'] });
      toast.success("Analytics updated");
      resetForm();
    },
    onError: (error) => {
      console.error('Update error:', error);
      toast.error(error instanceof Error ? error.message : "Failed to update analytics");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('client_analytics')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-client-analytics'] });
      toast.success("Analytics deleted");
    },
    onError: (error) => {
      console.error('Delete error:', error);
      toast.error(error instanceof Error ? error.message : "Failed to delete analytics");
    },
  });

  const resetForm = () => {
    setFormData({
      client_account_id: clientId ?? '',
      period_start: '',
      period_end: '',
      website_visits: '',
      leads_generated: '',
      email_opens: '',
      email_clicks: '',
      social_reach: '',
      conversions: '',
      highlights: '',
    });
    setEditingAnalytics(null);
    setIsOpen(false);
  };

  const handleEdit = (item: ClientAnalytics) => {
    setEditingAnalytics(item);
    setFormData({
      client_account_id: item.client_account_id,
      period_start: item.period_start,
      period_end: item.period_end,
      website_visits: String(item.metrics?.website_visits || ''),
      leads_generated: String(item.metrics?.leads_generated || ''),
      email_opens: String(item.metrics?.email_opens || ''),
      email_clicks: String(item.metrics?.email_clicks || ''),
      social_reach: String(item.metrics?.social_reach || ''),
      conversions: String(item.metrics?.conversions || ''),
      highlights: item.highlights?.items?.join('\n') || '',
    });
    setIsOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.client_account_id || !formData.period_start || !formData.period_end) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (editingAnalytics) {
      updateMutation.mutate({ id: editingAnalytics.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const displayedAnalytics = clientId
    ? analytics?.filter((a) => a.client_account_id === clientId)
    : analytics;

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
          <h2 className="text-2xl font-bold">Client Analytics</h2>
          <p className="text-muted-foreground">Manage performance metrics for clients.</p>
        </div>
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsOpen(open); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Analytics
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingAnalytics ? 'Edit Analytics' : 'Add Analytics Snapshot'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {!clientId && (
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
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Period Start *</Label>
                  <Input type="date" value={formData.period_start} onChange={(e) => setFormData({ ...formData, period_start: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Period End *</Label>
                  <Input type="date" value={formData.period_end} onChange={(e) => setFormData({ ...formData, period_end: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="button" variant="outline" size="sm" onClick={syncRealEngagement} disabled={syncingEngagement}>
                  {syncingEngagement ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Pull Real Leads/Opens/Clicks
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Website Visits</Label>
                  <Input type="number" value={formData.website_visits} onChange={(e) => setFormData({ ...formData, website_visits: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <Label>Leads Generated</Label>
                  <Input type="number" value={formData.leads_generated} onChange={(e) => setFormData({ ...formData, leads_generated: e.target.value })} placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email Opens</Label>
                  <Input type="number" value={formData.email_opens} onChange={(e) => setFormData({ ...formData, email_opens: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <Label>Email Clicks</Label>
                  <Input type="number" value={formData.email_clicks} onChange={(e) => setFormData({ ...formData, email_clicks: e.target.value })} placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Social Reach</Label>
                  <Input type="number" value={formData.social_reach} onChange={(e) => setFormData({ ...formData, social_reach: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <Label>Conversions</Label>
                  <Input type="number" value={formData.conversions} onChange={(e) => setFormData({ ...formData, conversions: e.target.value })} placeholder="0" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Highlights (one per line)</Label>
                <Textarea value={formData.highlights} onChange={(e) => setFormData({ ...formData, highlights: e.target.value })} placeholder="Achieved 20% increase in conversions&#10;Email campaign exceeded benchmarks" rows={4} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={resetForm}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingAnalytics ? 'Update' : 'Create'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {clientId && (
        <Card>
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label>GA4 Property ID (website traffic source)</Label>
              <Input
                value={ga4Input}
                onChange={(e) => setGa4Input(e.target.value)}
                placeholder="properties/123456789"
              />
              <p className="text-xs text-muted-foreground">
                Grant this project's GA4 service account "Viewer" access on the client's GA4 property, then paste the property ID here. Website Visits sync automatically every Monday.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={saveGa4PropertyId} disabled={savingGa4 || ga4Input.trim() === (selectedClient?.ga4_property_id || '')}>
                {savingGa4 ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save
              </Button>
              <Button onClick={syncGa4Now} disabled={syncingGa4 || !selectedClient?.ga4_property_id}>
                {syncingGa4 ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Sync Now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Visits</TableHead>
                <TableHead>Leads</TableHead>
                <TableHead>Opens</TableHead>
                <TableHead>Clicks</TableHead>
                <TableHead>Conversions</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedAnalytics?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No analytics data yet. Add your first snapshot to get started.
                  </TableCell>
                </TableRow>
              ) : (
                displayedAnalytics?.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.client_accounts?.business_name}</TableCell>
                    <TableCell>
                      {format(new Date(item.period_start), 'MMM d')} - {format(new Date(item.period_end), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>{item.metrics?.website_visits || 0}</TableCell>
                    <TableCell>{item.metrics?.leads_generated || 0}</TableCell>
                    <TableCell>{item.metrics?.email_opens || 0}</TableCell>
                    <TableCell>{item.metrics?.email_clicks || 0}</TableCell>
                    <TableCell>{item.metrics?.conversions || 0}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(item.id)}>
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
