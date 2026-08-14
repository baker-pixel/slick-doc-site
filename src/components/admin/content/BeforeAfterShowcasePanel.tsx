import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import { 
  Image, 
  Plus, 
  Trash2, 
  Eye, 
  EyeOff,
  ArrowRight,
  TrendingUp,
  Zap,
  BarChart3,
  Wand2,
  Download,
  Share2
} from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

interface BeforeAfterShowcase {
  id: string;
  client_account_id: string;
  title: string;
  description: string | null;
  project_type: string;
  before_screenshot_url: string | null;
  after_screenshot_url: string | null;
  before_mobile_url: string | null;
  after_mobile_url: string | null;
  before_stats: {
    seo_score?: number;
    speed_score?: number;
    accessibility_score?: number;
    load_time?: number;
  };
  after_stats: {
    seo_score?: number;
    speed_score?: number;
    accessibility_score?: number;
    load_time?: number;
  };
  improvements: Array<{ metric: string; before: string; after: string; improvement: string }>;
  is_public: boolean;
  created_at: string;
}

const projectTypes = [
  { value: 'website_redesign', label: 'Website Redesign' },
  { value: 'seo_optimization', label: 'SEO Optimization' },
  { value: 'speed_optimization', label: 'Speed Optimization' },
  { value: 'branding', label: 'Branding Update' },
  { value: 'landing_page', label: 'Landing Page' },
];

export default function BeforeAfterShowcasePanel() {
  const { adminPassword } = useAdminAuth();
  const queryClient = useQueryClient();
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [newShowcase, setNewShowcase] = useState<Partial<BeforeAfterShowcase>>({
    project_type: 'website_redesign',
    is_public: false,
    before_stats: {},
    after_stats: {},
    improvements: []
  });

  // Routed through the `admin` edge function (service role), not direct
  // table queries -- both tables' RLS is admin-JWT-only, and a legacy
  // password login carries no guaranteed JWT (the magic-link session mint
  // is best-effort). Same pattern already used by ProspectEnginePanel. The
  // generic list action has no filter/order support, so status/client/date
  // filtering happens client-side after the fetch.
  const { data: clients } = useQuery({
    queryKey: ['clients-for-showcase'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('admin', {
        body: { action: 'list', table: 'client_accounts', password: adminPassword },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : 'Failed to load clients');
      }
      return ((data?.data ?? []) as { id: string; business_name: string; status: string }[])
        .filter(c => c.status === 'active')
        .sort((a, b) => a.business_name.localeCompare(b.business_name));
    }
  });

  const { data: showcases, isLoading } = useQuery({
    queryKey: ['before-after-showcases', selectedClient],
    queryFn: async () => {
      if (!selectedClient) return [];
      const { data, error } = await supabase.functions.invoke('admin', {
        body: { action: 'list', table: 'before_after_showcases', password: adminPassword },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : 'Failed to load showcases');
      }
      return ((data?.data ?? []) as unknown as BeforeAfterShowcase[])
        .filter(s => s.client_account_id === selectedClient)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    enabled: !!selectedClient
  });

  const createShowcaseMutation = useMutation({
    mutationFn: async (showcase: Partial<BeforeAfterShowcase>) => {
      const { data, error } = await supabase.functions.invoke('admin', {
        body: {
          action: 'create',
          table: 'before_after_showcases',
          password: adminPassword,
          data: {
            client_account_id: selectedClient,
            title: showcase.title,
            description: showcase.description,
            project_type: showcase.project_type,
            before_screenshot_url: showcase.before_screenshot_url,
            after_screenshot_url: showcase.after_screenshot_url,
            before_mobile_url: showcase.before_mobile_url,
            after_mobile_url: showcase.after_mobile_url,
            before_stats: showcase.before_stats,
            after_stats: showcase.after_stats,
            improvements: showcase.improvements,
            is_public: showcase.is_public,
          },
        },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to create showcase");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['before-after-showcases'] });
      toast.success('Showcase created');
      setIsCreating(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const togglePublicMutation = useMutation({
    mutationFn: async ({ id, is_public }: { id: string; is_public: boolean }) => {
      const { data, error } = await supabase.functions.invoke('admin', {
        body: { action: 'update', table: 'before_after_showcases', id, password: adminPassword, data: { is_public } },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to update visibility");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['before-after-showcases'] });
      toast.success('Visibility updated');
    },
    onError: (error) => toast.error(error.message)
  });

  const deleteShowcaseMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('admin', {
        body: { action: 'delete', table: 'before_after_showcases', id, password: adminPassword },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to delete showcase");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['before-after-showcases'] });
      toast.success('Showcase deleted');
    },
    onError: (error) => toast.error(error.message)
  });

  const generateShowcase = async () => {
    if (!selectedClient) return;
    
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-before-after', {
        body: { clientId: selectedClient, password: adminPassword }
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to generate showcase");
      }

      setIsCreating(true);
      setNewShowcase(prev => ({
        ...prev,
        ...data.showcase
      }));
      toast.success('Showcase data generated from SEO audit history');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error('Could not auto-generate showcase', { description: message });
    } finally {
      setIsGenerating(false);
    }
  };

  const resetForm = () => {
    setNewShowcase({
      project_type: 'website_redesign',
      is_public: false,
      before_stats: {},
      after_stats: {},
      improvements: []
    });
  };

  const addImprovement = () => {
    setNewShowcase(prev => ({
      ...prev,
      improvements: [...(prev.improvements || []), { metric: '', before: '', after: '', improvement: '' }]
    }));
  };

  const updateImprovement = (index: number, field: string, value: string) => {
    setNewShowcase(prev => ({
      ...prev,
      improvements: prev.improvements?.map((imp, i) => 
        i === index ? { ...imp, [field]: value } : imp
      )
    }));
  };

  const removeImprovement = (index: number) => {
    setNewShowcase(prev => ({
      ...prev,
      improvements: prev.improvements?.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Before & After Showcases</h2>
          <p className="text-muted-foreground">
            Create compelling visual comparisons for sales and client presentations
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            Select Client
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Choose a client" />
            </SelectTrigger>
            <SelectContent>
              {clients?.map(client => (
                <SelectItem key={client.id} value={client.id}>
                  {client.business_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedClient && (
            <div className="flex gap-2">
              <Button onClick={() => setIsCreating(true)} disabled={isCreating}>
                <Plus className="h-4 w-4 mr-2" />
                Create Showcase
              </Button>
              <Button variant="outline" onClick={generateShowcase} disabled={isGenerating}>
                <Wand2 className="h-4 w-4 mr-2" />
                {isGenerating ? 'Generating...' : 'Auto-Generate from Data'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {isCreating && selectedClient && (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle>New Before & After Showcase</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  placeholder="e.g., Website Redesign 2024"
                  value={newShowcase.title || ''}
                  onChange={(e) => setNewShowcase(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Project Type</Label>
                <Select 
                  value={newShowcase.project_type} 
                  onValueChange={(v) => setNewShowcase(prev => ({ ...prev, project_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {projectTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Describe the project and key improvements..."
                value={newShowcase.description || ''}
                onChange={(e) => setNewShowcase(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <span className="text-red-500">Before</span>
                </h4>
                <div className="space-y-2">
                  <Label>Desktop Screenshot URL</Label>
                  <Input
                    placeholder="https://..."
                    value={newShowcase.before_screenshot_url || ''}
                    onChange={(e) => setNewShowcase(prev => ({ ...prev, before_screenshot_url: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mobile Screenshot URL</Label>
                  <Input
                    placeholder="https://..."
                    value={newShowcase.before_mobile_url || ''}
                    onChange={(e) => setNewShowcase(prev => ({ ...prev, before_mobile_url: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label>SEO Score</Label>
                    <Input
                      type="number"
                      value={newShowcase.before_stats?.seo_score || ''}
                      onChange={(e) => setNewShowcase(prev => ({ 
                        ...prev, 
                        before_stats: { ...prev.before_stats, seo_score: parseInt(e.target.value) }
                      }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Speed Score</Label>
                    <Input
                      type="number"
                      value={newShowcase.before_stats?.speed_score || ''}
                      onChange={(e) => setNewShowcase(prev => ({ 
                        ...prev, 
                        before_stats: { ...prev.before_stats, speed_score: parseInt(e.target.value) }
                      }))}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <span className="text-green-500">After</span>
                </h4>
                <div className="space-y-2">
                  <Label>Desktop Screenshot URL</Label>
                  <Input
                    placeholder="https://..."
                    value={newShowcase.after_screenshot_url || ''}
                    onChange={(e) => setNewShowcase(prev => ({ ...prev, after_screenshot_url: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mobile Screenshot URL</Label>
                  <Input
                    placeholder="https://..."
                    value={newShowcase.after_mobile_url || ''}
                    onChange={(e) => setNewShowcase(prev => ({ ...prev, after_mobile_url: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label>SEO Score</Label>
                    <Input
                      type="number"
                      value={newShowcase.after_stats?.seo_score || ''}
                      onChange={(e) => setNewShowcase(prev => ({ 
                        ...prev, 
                        after_stats: { ...prev.after_stats, seo_score: parseInt(e.target.value) }
                      }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Speed Score</Label>
                    <Input
                      type="number"
                      value={newShowcase.after_stats?.speed_score || ''}
                      onChange={(e) => setNewShowcase(prev => ({ 
                        ...prev, 
                        after_stats: { ...prev.after_stats, speed_score: parseInt(e.target.value) }
                      }))}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Key Improvements</Label>
                <Button variant="outline" size="sm" onClick={addImprovement}>
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>
              {newShowcase.improvements?.map((imp, idx) => (
                <div key={idx} className="grid grid-cols-5 gap-2 items-end">
                  <Input
                    placeholder="Metric"
                    value={imp.metric}
                    onChange={(e) => updateImprovement(idx, 'metric', e.target.value)}
                  />
                  <Input
                    placeholder="Before"
                    value={imp.before}
                    onChange={(e) => updateImprovement(idx, 'before', e.target.value)}
                  />
                  <Input
                    placeholder="After"
                    value={imp.after}
                    onChange={(e) => updateImprovement(idx, 'after', e.target.value)}
                  />
                  <Input
                    placeholder="+50%"
                    value={imp.improvement}
                    onChange={(e) => updateImprovement(idx, 'improvement', e.target.value)}
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeImprovement(idx)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={newShowcase.is_public}
                onCheckedChange={(checked) => setNewShowcase(prev => ({ ...prev, is_public: checked }))}
              />
              <Label>Make Public (visible on portfolio)</Label>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setIsCreating(false); resetForm(); }}>
                Cancel
              </Button>
              <Button 
                onClick={() => createShowcaseMutation.mutate(newShowcase)}
                disabled={!newShowcase.title}
              >
                Create Showcase
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedClient && !isCreating && (
        <Card>
          <CardHeader>
            <CardTitle>Showcases</CardTitle>
            <CardDescription>
              {showcases?.length || 0} showcases created
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : showcases?.length === 0 ? (
              <p className="text-muted-foreground">No showcases yet. Create one above!</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {showcases?.map(showcase => (
                  <Card key={showcase.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h4 className="font-medium">{showcase.title}</h4>
                          <Badge variant="outline" className="mt-1">
                            {projectTypes.find(t => t.value === showcase.project_type)?.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => togglePublicMutation.mutate({ 
                              id: showcase.id, 
                              is_public: !showcase.is_public 
                            })}
                          >
                            {showcase.is_public ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteShowcaseMutation.mutate(showcase.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>

                      {showcase.improvements && showcase.improvements.length > 0 && (
                        <div className="space-y-2 mb-4">
                          {showcase.improvements.slice(0, 3).map((imp, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-sm">
                              <TrendingUp className="h-4 w-4 text-green-500" />
                              <span className="text-muted-foreground">{imp.metric}:</span>
                              <span className="text-red-500">{imp.before}</span>
                              <ArrowRight className="h-3 w-3" />
                              <span className="text-green-500">{imp.after}</span>
                              <Badge className="bg-green-500/10 text-green-500 text-xs">{imp.improvement}</Badge>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">
                          <Download className="h-4 w-4 mr-1" />
                          Export
                        </Button>
                        <Button variant="outline" size="sm">
                          <Share2 className="h-4 w-4 mr-1" />
                          Share
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
