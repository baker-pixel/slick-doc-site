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
import { 
  Users, 
  MapPin, 
  RotateCcw, 
  ShoppingCart, 
  MousePointer,
  Sparkles,
  Plus,
  Trash2,
  Eye,
  Code,
  Wand2
} from "lucide-react";

type UserSegment = 'new_visitor' | 'returning_visitor' | 'local_user' | 'out_of_town' | 'past_buyer' | 'engaged_scroller';

interface PersonalizationRule {
  id: string;
  name: string;
  segment: UserSegment;
  component_type: 'headline' | 'cta' | 'banner' | 'offer';
  original_content: string;
  personalized_content: string;
  is_active: boolean;
  priority: number;
  conditions: {
    scroll_depth?: number;
    page_views?: number;
    time_on_site?: number;
    geo_radius_miles?: number;
  };
}

const segmentConfig: Record<UserSegment, { label: string; icon: React.ReactNode; description: string }> = {
  new_visitor: { 
    label: 'New Visitor', 
    icon: <Users className="h-4 w-4" />,
    description: 'First-time visitors to your site'
  },
  returning_visitor: { 
    label: 'Returning Visitor', 
    icon: <RotateCcw className="h-4 w-4" />,
    description: 'Users who have visited before'
  },
  local_user: { 
    label: 'Local User', 
    icon: <MapPin className="h-4 w-4" />,
    description: 'Visitors from your service area'
  },
  out_of_town: { 
    label: 'Out of Town', 
    icon: <MapPin className="h-4 w-4" />,
    description: 'Visitors outside your service area'
  },
  past_buyer: { 
    label: 'Past Buyer', 
    icon: <ShoppingCart className="h-4 w-4" />,
    description: 'Previous customers'
  },
  engaged_scroller: { 
    label: 'Engaged Scroller', 
    icon: <MousePointer className="h-4 w-4" />,
    description: 'Users who scroll 50%+ of page'
  },
};

export default function WebsitePersonalizationPanel() {
  const queryClient = useQueryClient();
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [newRule, setNewRule] = useState<Partial<PersonalizationRule>>({
    segment: 'new_visitor',
    component_type: 'headline',
    is_active: true,
    priority: 1,
    conditions: {}
  });

  const { data: clients } = useQuery({
    queryKey: ['clients-for-personalization'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_accounts')
        .select('id, business_name')
        .eq('status', 'active')
        .order('business_name');
      if (error) throw error;
      return data;
    }
  });

  const { data: rules, isLoading: rulesLoading } = useQuery({
    queryKey: ['personalization-rules', selectedClient],
    queryFn: async () => {
      if (!selectedClient) return [];
      const { data, error } = await supabase
        .from('personalization_rules')
        .select('*')
        .eq('client_account_id', selectedClient)
        .order('priority');
      if (error) throw error;
      return data as PersonalizationRule[];
    },
    enabled: !!selectedClient
  });

  const createRuleMutation = useMutation({
    mutationFn: async (rule: Partial<PersonalizationRule>) => {
      const { error } = await supabase
        .from('personalization_rules')
        .insert({
          client_account_id: selectedClient,
          name: rule.name,
          segment: rule.segment,
          component_type: rule.component_type,
          original_content: rule.original_content,
          personalized_content: rule.personalized_content,
          is_active: rule.is_active,
          priority: rule.priority,
          conditions: rule.conditions
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personalization-rules'] });
      toast.success('Personalization rule created');
      setIsCreating(false);
      setNewRule({
        segment: 'new_visitor',
        component_type: 'headline',
        is_active: true,
        priority: 1,
        conditions: {}
      });
    },
    onError: (error) => {
      toast.error('Failed to create rule: ' + error.message);
    }
  });

  const toggleRuleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('personalization_rules')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personalization-rules'] });
      toast.success('Rule updated');
    }
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('personalization_rules')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personalization-rules'] });
      toast.success('Rule deleted');
    }
  });

  const generatePersonalizedContent = async () => {
    if (!newRule.original_content || !newRule.segment) {
      toast.error('Please provide original content and select a segment');
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-personalized-content', {
        body: {
          originalContent: newRule.original_content,
          segment: newRule.segment,
          componentType: newRule.component_type
        }
      });

      if (error) throw error;
      
      setNewRule(prev => ({
        ...prev,
        personalized_content: data.personalizedContent
      }));
      toast.success('AI generated personalized content');
    } catch (error) {
      toast.error('Failed to generate content');
    } finally {
      setIsGenerating(false);
    }
  };

  const getRulesBySegment = (segment: UserSegment) => {
    return rules?.filter(r => r.segment === segment) || [];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Website Personalization</h2>
          <p className="text-muted-foreground">
            Dynamically personalize content based on user behavior and segments
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Select Client
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Choose a client to manage personalization" />
            </SelectTrigger>
            <SelectContent>
              {clients?.map(client => (
                <SelectItem key={client.id} value={client.id}>
                  {client.business_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedClient && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {Object.entries(segmentConfig).map(([segment, config]) => {
              const segmentRules = getRulesBySegment(segment as UserSegment);
              const activeRules = segmentRules.filter(r => r.is_active).length;
              
              return (
                <Card key={segment} className="text-center">
                  <CardContent className="pt-4">
                    <div className="flex justify-center mb-2 text-primary">
                      {config.icon}
                    </div>
                    <p className="font-medium text-sm">{config.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {activeRules} / {segmentRules.length} active
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Personalization Rules</CardTitle>
                <CardDescription>
                  Create rules to show different content to different user segments
                </CardDescription>
              </div>
              <Button onClick={() => setIsCreating(true)} disabled={isCreating}>
                <Plus className="h-4 w-4 mr-2" />
                Add Rule
              </Button>
            </CardHeader>
            <CardContent>
              {isCreating && (
                <Card className="mb-6 border-primary/20 bg-primary/5">
                  <CardHeader>
                    <CardTitle className="text-lg">New Personalization Rule</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Rule Name</Label>
                        <Input
                          placeholder="e.g., Welcome Back Headline"
                          value={newRule.name || ''}
                          onChange={(e) => setNewRule(prev => ({ ...prev, name: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>User Segment</Label>
                        <Select 
                          value={newRule.segment} 
                          onValueChange={(v) => setNewRule(prev => ({ ...prev, segment: v as UserSegment }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(segmentConfig).map(([seg, config]) => (
                              <SelectItem key={seg} value={seg}>
                                <div className="flex items-center gap-2">
                                  {config.icon}
                                  {config.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Component Type</Label>
                        <Select 
                          value={newRule.component_type} 
                          onValueChange={(v) => setNewRule(prev => ({ ...prev, component_type: v as any }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="headline">Headline</SelectItem>
                            <SelectItem value="cta">Call to Action</SelectItem>
                            <SelectItem value="banner">Banner</SelectItem>
                            <SelectItem value="offer">Special Offer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Priority (lower = higher priority)</Label>
                        <Input
                          type="number"
                          min={1}
                          value={newRule.priority || 1}
                          onChange={(e) => setNewRule(prev => ({ ...prev, priority: parseInt(e.target.value) }))}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Original Content</Label>
                      <Textarea
                        placeholder="The default content that will be personalized"
                        value={newRule.original_content || ''}
                        onChange={(e) => setNewRule(prev => ({ ...prev, original_content: e.target.value }))}
                        rows={2}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Personalized Content</Label>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={generatePersonalizedContent}
                          disabled={isGenerating}
                        >
                          <Wand2 className="h-4 w-4 mr-2" />
                          {isGenerating ? 'Generating...' : 'Generate with AI'}
                        </Button>
                      </div>
                      <Textarea
                        placeholder="The personalized version for this segment"
                        value={newRule.personalized_content || ''}
                        onChange={(e) => setNewRule(prev => ({ ...prev, personalized_content: e.target.value }))}
                        rows={2}
                      />
                    </div>

                    {newRule.segment === 'engaged_scroller' && (
                      <div className="space-y-2">
                        <Label>Scroll Depth Trigger (%)</Label>
                        <Input
                          type="number"
                          min={10}
                          max={100}
                          value={newRule.conditions?.scroll_depth || 50}
                          onChange={(e) => setNewRule(prev => ({ 
                            ...prev, 
                            conditions: { ...prev.conditions, scroll_depth: parseInt(e.target.value) }
                          }))}
                        />
                      </div>
                    )}

                    {(newRule.segment === 'local_user' || newRule.segment === 'out_of_town') && (
                      <div className="space-y-2">
                        <Label>Geo Radius (miles)</Label>
                        <Input
                          type="number"
                          min={1}
                          value={newRule.conditions?.geo_radius_miles || 25}
                          onChange={(e) => setNewRule(prev => ({ 
                            ...prev, 
                            conditions: { ...prev.conditions, geo_radius_miles: parseInt(e.target.value) }
                          }))}
                        />
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={newRule.is_active}
                        onCheckedChange={(checked) => setNewRule(prev => ({ ...prev, is_active: checked }))}
                      />
                      <Label>Active</Label>
                    </div>

                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => setIsCreating(false)}>
                        Cancel
                      </Button>
                      <Button 
                        onClick={() => createRuleMutation.mutate(newRule)}
                        disabled={!newRule.name || !newRule.original_content || !newRule.personalized_content}
                      >
                        Create Rule
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Tabs defaultValue="all">
                <TabsList>
                  <TabsTrigger value="all">All Rules</TabsTrigger>
                  {Object.entries(segmentConfig).map(([seg, config]) => (
                    <TabsTrigger key={seg} value={seg} className="hidden md:inline-flex">
                      {config.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="all" className="mt-4">
                  {rulesLoading ? (
                    <p className="text-muted-foreground">Loading rules...</p>
                  ) : rules?.length === 0 ? (
                    <p className="text-muted-foreground">No personalization rules yet. Create one above!</p>
                  ) : (
                    <div className="space-y-3">
                      {rules?.map(rule => (
                        <RuleCard
                          key={rule.id}
                          rule={rule}
                          onToggle={(is_active) => toggleRuleMutation.mutate({ id: rule.id, is_active })}
                          onDelete={() => deleteRuleMutation.mutate(rule.id)}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>

                {Object.keys(segmentConfig).map(seg => (
                  <TabsContent key={seg} value={seg} className="mt-4">
                    {getRulesBySegment(seg as UserSegment).length === 0 ? (
                      <p className="text-muted-foreground">No rules for this segment</p>
                    ) : (
                      <div className="space-y-3">
                        {getRulesBySegment(seg as UserSegment).map(rule => (
                          <RuleCard
                            key={rule.id}
                            rule={rule}
                            onToggle={(is_active) => toggleRuleMutation.mutate({ id: rule.id, is_active })}
                            onDelete={() => deleteRuleMutation.mutate(rule.id)}
                          />
                        ))}
                      </div>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                Integration Code
              </CardTitle>
              <CardDescription>
                Add this script to the client's website to enable personalization
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
                {`<script src="https://cdn.orangedoormarketing.com/personalize.js" 
  data-client-id="${selectedClient}"
  async></script>`}
              </pre>
              <Button variant="outline" className="mt-4" onClick={() => {
                navigator.clipboard.writeText(`<script src="https://cdn.orangedoormarketing.com/personalize.js" data-client-id="${selectedClient}" async></script>`);
                toast.success('Code copied to clipboard');
              }}>
                Copy Code
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function RuleCard({ 
  rule, 
  onToggle, 
  onDelete 
}: { 
  rule: PersonalizationRule; 
  onToggle: (active: boolean) => void;
  onDelete: () => void;
}) {
  const segmentInfo = segmentConfig[rule.segment];

  return (
    <Card className={!rule.is_active ? 'opacity-60' : ''}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="font-medium">{rule.name}</h4>
              <Badge variant="outline" className="text-xs">
                {segmentInfo.icon}
                <span className="ml-1">{segmentInfo.label}</span>
              </Badge>
              <Badge variant="secondary" className="text-xs capitalize">
                {rule.component_type}
              </Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs mb-1">Original:</p>
                <p className="text-foreground">{rule.original_content}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Personalized:
                </p>
                <p className="text-primary">{rule.personalized_content}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <Switch
              checked={rule.is_active}
              onCheckedChange={onToggle}
            />
            <Button variant="ghost" size="icon" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
