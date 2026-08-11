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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import { format } from "date-fns";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { 
  FileText, 
  Plus, 
  Trash2, 
  Send,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  Wand2,
  DollarSign,
  Calendar,
  BarChart3,
  Palette
} from "lucide-react";

interface SalesProposal {
  id: string;
  contact_submission_id: string | null;
  prospect_name: string;
  prospect_email: string;
  prospect_business: string;
  prospect_industry: string | null;
  industry_analysis: {
    market_size?: string;
    competitors?: string[];
    opportunities?: string[];
    challenges?: string[];
  };
  proposed_services: Array<{
    name: string;
    description: string;
    price: number;
  }>;
  sample_designs: Array<{
    title: string;
    url: string;
    description: string;
  }>;
  roi_projections: {
    monthly_leads?: number;
    conversion_rate?: number;
    avg_deal_value?: number;
    projected_revenue?: number;
    roi_percentage?: number;
  };
  timeline: Array<{
    phase: string;
    duration: string;
    deliverables: string[];
  }>;
  pricing_breakdown: Array<{
    item: string;
    price: number;
    frequency: 'one-time' | 'monthly' | 'yearly';
  }>;
  total_investment: number | null;
  status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined';
  sent_at: string | null;
  viewed_at: string | null;
  responded_at: string | null;
  created_at: string;
}

const industries = [
  'Home Services',
  'Healthcare',
  'Legal',
  'Real Estate',
  'Restaurant',
  'Retail',
  'Professional Services',
  'Construction',
  'Automotive',
  'Other'
];

export default function SalesProposalPanel() {
  const { adminPassword } = useAdminAuth();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<SalesProposal | null>(null);
  const [newProposal, setNewProposal] = useState<Partial<SalesProposal>>({
    proposed_services: [],
    sample_designs: [],
    timeline: [],
    pricing_breakdown: [],
    industry_analysis: {},
    roi_projections: {},
    status: 'draft'
  });

  // Routed through the `admin` edge function (service role), not direct
  // table queries -- sales_proposals RLS is admin-JWT-only, and a legacy
  // password login carries no guaranteed JWT (the magic-link session mint
  // is best-effort). Same pattern already used by ProspectEnginePanel.
  const { data: proposals, isLoading } = useQuery({
    queryKey: ['sales-proposals'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('admin', {
        body: { action: 'list', table: 'sales_proposals', password: adminPassword },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : 'Failed to load proposals');
      }
      return (data?.data || []) as unknown as SalesProposal[];
    }
  });

  const { data: contacts } = useQuery({
    queryKey: ['contact-submissions-for-proposals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_submissions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    }
  });

  const createProposalMutation = useMutation({
    mutationFn: async (proposal: Partial<SalesProposal>) => {
      const { data, error } = await supabase.functions.invoke('admin', {
        body: {
          action: 'create',
          table: 'sales_proposals',
          password: adminPassword,
          data: {
            prospect_name: proposal.prospect_name,
            prospect_email: proposal.prospect_email,
            prospect_business: proposal.prospect_business,
            prospect_industry: proposal.prospect_industry,
            industry_analysis: proposal.industry_analysis,
            proposed_services: proposal.proposed_services,
            sample_designs: proposal.sample_designs,
            roi_projections: proposal.roi_projections,
            timeline: proposal.timeline,
            pricing_breakdown: proposal.pricing_breakdown,
            total_investment: proposal.total_investment,
            contact_submission_id: proposal.contact_submission_id,
            status: 'draft',
          },
        },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to create proposal");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-proposals'] });
      toast.success('Proposal created');
      setIsCreating(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const sendProposalMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('send-sales-proposal', {
        body: { proposalId: id, password: adminPassword }
      });
      if (error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to send proposal");
      }

      const { data: updateData, error: updateError } = await supabase.functions.invoke('admin', {
        body: {
          action: 'update',
          table: 'sales_proposals',
          id,
          password: adminPassword,
          data: { status: 'sent', sent_at: new Date().toISOString() },
        },
      });
      if (updateError || updateData?.error) {
        const msg = await getEdgeErrorMessage(updateError, updateData);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Proposal was sent, but marking it as sent failed");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-proposals'] });
      toast.success('Proposal sent');
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const deleteProposalMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('admin', {
        body: { action: 'delete', table: 'sales_proposals', id, password: adminPassword },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to delete proposal");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-proposals'] });
      toast.success('Proposal deleted');
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const generateProposal = async () => {
    if (!newProposal.prospect_business || !newProposal.prospect_industry) {
      toast.error('Please provide business name and industry');
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-sales-proposal', {
        body: {
          businessName: newProposal.prospect_business,
          industry: newProposal.prospect_industry,
          prospectName: newProposal.prospect_name,
          password: adminPassword
        }
      });
      if (error) throw error;
      
      setNewProposal(prev => ({
        ...prev,
        ...data.proposal
      }));
      toast.success('AI-generated proposal ready');
    } catch (error) {
      toast.error('Failed to generate proposal');
    } finally {
      setIsGenerating(false);
    }
  };

  const resetForm = () => {
    setNewProposal({
      proposed_services: [],
      sample_designs: [],
      timeline: [],
      pricing_breakdown: [],
      industry_analysis: {},
      roi_projections: {},
      status: 'draft'
    });
  };

  const calculateTotal = () => {
    const oneTime = newProposal.pricing_breakdown
      ?.filter(p => p.frequency === 'one-time')
      .reduce((sum, p) => sum + (p.price || 0), 0) || 0;
    const monthly = newProposal.pricing_breakdown
      ?.filter(p => p.frequency === 'monthly')
      .reduce((sum, p) => sum + (p.price || 0), 0) || 0;
    return { oneTime, monthly };
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
        return <Badge className="bg-blue-500/10 text-blue-500"><Send className="h-3 w-3 mr-1" /> Sent</Badge>;
      case 'viewed':
        return <Badge className="bg-yellow-500/10 text-yellow-500"><Eye className="h-3 w-3 mr-1" /> Viewed</Badge>;
      case 'accepted':
        return <Badge className="bg-green-500/10 text-green-500"><CheckCircle2 className="h-3 w-3 mr-1" /> Accepted</Badge>;
      case 'declined':
        return <Badge className="bg-red-500/10 text-red-500"><XCircle className="h-3 w-3 mr-1" /> Declined</Badge>;
      default:
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" /> Draft</Badge>;
    }
  };

  const addService = () => {
    setNewProposal(prev => ({
      ...prev,
      proposed_services: [...(prev.proposed_services || []), { name: '', description: '', price: 0 }]
    }));
  };

  const addPricingItem = () => {
    setNewProposal(prev => ({
      ...prev,
      pricing_breakdown: [...(prev.pricing_breakdown || []), { item: '', price: 0, frequency: 'monthly' }]
    }));
  };

  const addTimelinePhase = () => {
    setNewProposal(prev => ({
      ...prev,
      timeline: [...(prev.timeline || []), { phase: '', duration: '', deliverables: [] }]
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">AI Sales Proposals</h2>
          <p className="text-muted-foreground">
            Generate custom proposals in minutes with AI-powered analysis
          </p>
        </div>
        <Button onClick={() => setIsCreating(true)} disabled={isCreating}>
          <Plus className="h-4 w-4 mr-2" />
          New Proposal
        </Button>
      </div>

      {/* Viewed/Accepted stat cards removed -- nothing in the system tracks
          proposal views or client responses (no tracking pixel, no hosted
          view page, no accept/decline handler exists), so those counts were
          permanently stuck at zero and misleading. Only Total/Sent reflect
          real state. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold">{proposals?.length || 0}</p>
            <p className="text-sm text-muted-foreground">Total Proposals</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-blue-500">
              {proposals?.filter(p => p.status === 'sent').length || 0}
            </p>
            <p className="text-sm text-muted-foreground">Sent</p>
          </CardContent>
        </Card>
      </div>

      {isCreating && (
        <Card className="border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Create New Proposal</CardTitle>
              <Button onClick={generateProposal} disabled={isGenerating}>
                <Wand2 className="h-4 w-4 mr-2" />
                {isGenerating ? 'Generating...' : 'Generate with AI'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="basics">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="basics">Basics</TabsTrigger>
                <TabsTrigger value="services">Services</TabsTrigger>
                <TabsTrigger value="roi">ROI</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="pricing">Pricing</TabsTrigger>
              </TabsList>

              <TabsContent value="basics" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Prospect Name</Label>
                    <Input
                      placeholder="John Smith"
                      value={newProposal.prospect_name || ''}
                      onChange={(e) => setNewProposal(prev => ({ ...prev, prospect_name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      placeholder="john@company.com"
                      value={newProposal.prospect_email || ''}
                      onChange={(e) => setNewProposal(prev => ({ ...prev, prospect_email: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Business Name</Label>
                    <Input
                      placeholder="Acme Corp"
                      value={newProposal.prospect_business || ''}
                      onChange={(e) => setNewProposal(prev => ({ ...prev, prospect_business: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Industry</Label>
                    <Select 
                      value={newProposal.prospect_industry || ''} 
                      onValueChange={(v) => setNewProposal(prev => ({ ...prev, prospect_industry: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select industry" />
                      </SelectTrigger>
                      <SelectContent>
                        {industries.map(ind => (
                          <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {contacts && contacts.length > 0 && (
                  <div className="space-y-2">
                    <Label>Or Import from Contact Submission</Label>
                    <Select 
                      onValueChange={(v) => {
                        const contact = contacts.find(c => c.id === v);
                        if (contact) {
                          setNewProposal(prev => ({
                            ...prev,
                            contact_submission_id: contact.id,
                            prospect_name: `${contact.first_name} ${contact.last_name}`,
                            prospect_email: contact.email,
                            prospect_business: contact.business_name
                          }));
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a contact..." />
                      </SelectTrigger>
                      <SelectContent>
                        {contacts.map(contact => (
                          <SelectItem key={contact.id} value={contact.id}>
                            {contact.first_name} {contact.last_name} - {contact.business_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="services" className="space-y-4 mt-4">
                <div className="flex justify-between items-center">
                  <Label>Proposed Services</Label>
                  <Button variant="outline" size="sm" onClick={addService}>
                    <Plus className="h-4 w-4 mr-1" /> Add Service
                  </Button>
                </div>
                {newProposal.proposed_services?.map((service, idx) => (
                  <div key={idx} className="grid grid-cols-4 gap-2 items-end">
                    <Input
                      placeholder="Service name"
                      value={service.name}
                      onChange={(e) => {
                        const updated = [...(newProposal.proposed_services || [])];
                        updated[idx] = { ...updated[idx], name: e.target.value };
                        setNewProposal(prev => ({ ...prev, proposed_services: updated }));
                      }}
                    />
                    <Input
                      placeholder="Description"
                      value={service.description}
                      className="col-span-2"
                      onChange={(e) => {
                        const updated = [...(newProposal.proposed_services || [])];
                        updated[idx] = { ...updated[idx], description: e.target.value };
                        setNewProposal(prev => ({ ...prev, proposed_services: updated }));
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setNewProposal(prev => ({
                          ...prev,
                          proposed_services: prev.proposed_services?.filter((_, i) => i !== idx)
                        }));
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="roi" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Est. Monthly Leads</Label>
                    <Input
                      type="number"
                      value={newProposal.roi_projections?.monthly_leads || ''}
                      onChange={(e) => setNewProposal(prev => ({
                        ...prev,
                        roi_projections: { ...prev.roi_projections, monthly_leads: parseInt(e.target.value) }
                      }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Conversion Rate (%)</Label>
                    <Input
                      type="number"
                      value={newProposal.roi_projections?.conversion_rate || ''}
                      onChange={(e) => setNewProposal(prev => ({
                        ...prev,
                        roi_projections: { ...prev.roi_projections, conversion_rate: parseFloat(e.target.value) }
                      }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Avg Deal Value ($)</Label>
                    <Input
                      type="number"
                      value={newProposal.roi_projections?.avg_deal_value || ''}
                      onChange={(e) => setNewProposal(prev => ({
                        ...prev,
                        roi_projections: { ...prev.roi_projections, avg_deal_value: parseFloat(e.target.value) }
                      }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Projected Monthly Revenue ($)</Label>
                    <Input
                      type="number"
                      value={newProposal.roi_projections?.projected_revenue || ''}
                      onChange={(e) => setNewProposal(prev => ({
                        ...prev,
                        roi_projections: { ...prev.roi_projections, projected_revenue: parseFloat(e.target.value) }
                      }))}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="timeline" className="space-y-4 mt-4">
                <div className="flex justify-between items-center">
                  <Label>Project Timeline</Label>
                  <Button variant="outline" size="sm" onClick={addTimelinePhase}>
                    <Plus className="h-4 w-4 mr-1" /> Add Phase
                  </Button>
                </div>
                {newProposal.timeline?.map((phase, idx) => (
                  <div key={idx} className="grid grid-cols-3 gap-2 items-end">
                    <Input
                      placeholder="Phase name"
                      value={phase.phase}
                      onChange={(e) => {
                        const updated = [...(newProposal.timeline || [])];
                        updated[idx] = { ...updated[idx], phase: e.target.value };
                        setNewProposal(prev => ({ ...prev, timeline: updated }));
                      }}
                    />
                    <Input
                      placeholder="Duration (e.g., 2 weeks)"
                      value={phase.duration}
                      onChange={(e) => {
                        const updated = [...(newProposal.timeline || [])];
                        updated[idx] = { ...updated[idx], duration: e.target.value };
                        setNewProposal(prev => ({ ...prev, timeline: updated }));
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setNewProposal(prev => ({
                          ...prev,
                          timeline: prev.timeline?.filter((_, i) => i !== idx)
                        }));
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="pricing" className="space-y-4 mt-4">
                <div className="flex justify-between items-center">
                  <Label>Pricing Breakdown</Label>
                  <Button variant="outline" size="sm" onClick={addPricingItem}>
                    <Plus className="h-4 w-4 mr-1" /> Add Item
                  </Button>
                </div>
                {newProposal.pricing_breakdown?.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-4 gap-2 items-end">
                    <Input
                      placeholder="Item"
                      value={item.item}
                      onChange={(e) => {
                        const updated = [...(newProposal.pricing_breakdown || [])];
                        updated[idx] = { ...updated[idx], item: e.target.value };
                        setNewProposal(prev => ({ ...prev, pricing_breakdown: updated }));
                      }}
                    />
                    <Input
                      type="number"
                      placeholder="Price"
                      value={item.price || ''}
                      onChange={(e) => {
                        const updated = [...(newProposal.pricing_breakdown || [])];
                        updated[idx] = { ...updated[idx], price: parseFloat(e.target.value) };
                        setNewProposal(prev => ({ ...prev, pricing_breakdown: updated }));
                      }}
                    />
                    <Select
                      value={item.frequency}
                      onValueChange={(v) => {
                        const updated = [...(newProposal.pricing_breakdown || [])];
                        updated[idx] = { ...updated[idx], frequency: v as any };
                        setNewProposal(prev => ({ ...prev, pricing_breakdown: updated }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="one-time">One-time</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setNewProposal(prev => ({
                          ...prev,
                          pricing_breakdown: prev.pricing_breakdown?.filter((_, i) => i !== idx)
                        }));
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}

                {newProposal.pricing_breakdown && newProposal.pricing_breakdown.length > 0 && (
                  <div className="bg-muted p-4 rounded-lg mt-4">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">One-time Investment:</span>
                      <span className="text-xl font-bold">${calculateTotal().oneTime.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="font-medium">Monthly Investment:</span>
                      <span className="text-xl font-bold">${calculateTotal().monthly.toLocaleString()}/mo</span>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <div className="flex gap-2 justify-end mt-6">
              <Button variant="outline" onClick={() => { setIsCreating(false); resetForm(); }}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const totals = calculateTotal();
                  createProposalMutation.mutate({
                    ...newProposal,
                    total_investment: totals.oneTime + (totals.monthly * 12)
                  });
                }}
                disabled={!newProposal.prospect_name || !newProposal.prospect_email || !newProposal.prospect_business}
              >
                Create Proposal
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Proposals</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : proposals?.length === 0 ? (
            <p className="text-muted-foreground">No proposals yet. Create one above!</p>
          ) : (
            <div className="space-y-4">
              {proposals?.map(proposal => (
                <Card key={proposal.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{proposal.prospect_business}</h4>
                          {getStatusBadge(proposal.status)}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {proposal.prospect_name} • {proposal.prospect_email}
                        </p>
                        {proposal.prospect_industry && (
                          <Badge variant="outline" className="mt-2">{proposal.prospect_industry}</Badge>
                        )}
                      </div>
                      <div className="text-right">
                        {proposal.total_investment && (
                          <p className="text-lg font-bold text-primary">
                            ${proposal.total_investment.toLocaleString()}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Created {format(new Date(proposal.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 mt-4">
                      <Button variant="outline" size="sm" onClick={() => setSelectedProposal(proposal)}>
                        <Eye className="h-4 w-4 mr-1" />
                        Preview
                      </Button>
                      {proposal.status === 'draft' && (
                        <Button
                          size="sm"
                          onClick={() => sendProposalMutation.mutate(proposal.id)}
                        >
                          <Send className="h-4 w-4 mr-1" />
                          Send
                        </Button>
                      )}
                      <Button
                        variant="ghost" 
                        size="sm"
                        onClick={() => deleteProposalMutation.mutate(proposal.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedProposal} onOpenChange={(open) => !open && setSelectedProposal(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Proposal for {selectedProposal?.prospect_business}</DialogTitle>
          </DialogHeader>
          {selectedProposal && (
            <div className="space-y-6 py-2">
              <div className="text-sm text-muted-foreground">
                {selectedProposal.prospect_name} • {selectedProposal.prospect_email}
                {selectedProposal.prospect_industry && ` • ${selectedProposal.prospect_industry}`}
              </div>

              {selectedProposal.industry_analysis?.opportunities && (
                <div>
                  <h4 className="font-semibold mb-2">Opportunities</h4>
                  <ul className="list-disc pl-5 text-sm space-y-1 text-muted-foreground">
                    {selectedProposal.industry_analysis.opportunities.map((o, i) => <li key={i}>{o}</li>)}
                  </ul>
                </div>
              )}

              {selectedProposal.proposed_services?.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Proposed Services</h4>
                  <div className="space-y-2">
                    {selectedProposal.proposed_services.map((s, i) => (
                      <div key={i} className="p-3 bg-muted rounded-lg">
                        <div className="font-medium text-sm">{s.name}</div>
                        <div className="text-sm text-muted-foreground">{s.description}</div>
                        {s.price > 0 && <div className="text-sm font-medium mt-1">${s.price.toLocaleString()}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedProposal.timeline?.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Timeline</h4>
                  <div className="space-y-2">
                    {selectedProposal.timeline.map((t, i) => (
                      <div key={i} className="text-sm">
                        <span className="font-medium">{t.phase}</span>
                        <span className="text-muted-foreground"> ({t.duration})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedProposal.pricing_breakdown?.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Pricing</h4>
                  <div className="space-y-1">
                    {selectedProposal.pricing_breakdown.map((p, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span>{p.item}</span>
                        <span className="font-medium">${p.price.toLocaleString()}{p.frequency === "monthly" ? "/mo" : p.frequency === "yearly" ? "/yr" : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedProposal.total_investment != null && (
                <div className="pt-3 border-t flex justify-between items-center">
                  <span className="font-semibold">Total Investment</span>
                  <span className="text-lg font-bold text-primary">${selectedProposal.total_investment.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
