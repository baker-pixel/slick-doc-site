import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, Plus, Trash2, Eye, Download, Sparkles, Image, BarChart3 } from "lucide-react";

interface CaseStudyResults {
  metrics: Array<{ label: string; before: string; after: string; improvement: string }>;
  testimonial?: string;
  testimonial_author?: string;
}

interface CaseStudy {
  id: string;
  client_account_id: string;
  title: string;
  industry: string | null;
  challenge: string;
  solution: string;
  results: CaseStudyResults;
  status: string;
  created_at: string;
}

export default function CaseStudyBuilderPanel() {
  const queryClient = useQueryClient();
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    industry: "",
    challenge: "",
    solution: "",
    testimonial: "",
    testimonialAuthor: "",
    metrics: [{ label: "", before: "", after: "", improvement: "" }]
  });

  const { data: clients } = useQuery({
    queryKey: ["clients-for-case-study"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_accounts")
        .select("id, business_name, industry")
        .order("business_name");
      if (error) throw error;
      return data;
    }
  });

  const { data: caseStudies, isLoading } = useQuery({
    queryKey: ["case-studies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_studies")
        .select("*, client_accounts(business_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(item => ({
        ...item,
        results: (item.results as unknown as CaseStudyResults) || { metrics: [] }
      })) as (CaseStudy & { client_accounts: { business_name: string } | null })[];
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData & { clientId: string }) => {
      const { error } = await supabase.from("case_studies").insert({
        client_account_id: data.clientId,
        title: data.title,
        industry: data.industry,
        challenge: data.challenge,
        solution: data.solution,
        results: {
          metrics: data.metrics.filter(m => m.label),
          testimonial: data.testimonial || null,
          testimonial_author: data.testimonialAuthor || null
        },
        status: "draft"
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case-studies"] });
      toast.success("Case study created!");
      resetForm();
    },
    onError: () => toast.error("Failed to create case study")
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("case_studies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case-studies"] });
      toast.success("Case study deleted");
    }
  });

  const publishMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "draft" | "published" }) => {
      const { error } = await supabase.from("case_studies").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case-studies"] });
      toast.success("Status updated");
    }
  });

  const generateWithAI = async () => {
    if (!selectedClient) {
      toast.error("Please select a client first");
      return;
    }

    const client = clients?.find(c => c.id === selectedClient);
    if (!client) return;

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-case-study", {
        body: { clientAccountId: selectedClient },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const outline = data?.outline;
      if (outline) {
        setFormData(prev => ({
          ...prev,
          title: outline.title || prev.title,
          industry: client.industry || "",
          challenge: outline.challenge || prev.challenge,
          solution: outline.solution || prev.solution,
          metrics: outline.metrics?.length ? outline.metrics : prev.metrics
        }));
        toast.success("AI generated case study outline — review before publishing");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error("Failed to generate with AI", { description: message });
    } finally {
      setIsGenerating(false);
    }
  };

  const resetForm = () => {
    setIsCreating(false);
    setSelectedClient("");
    setFormData({
      title: "",
      industry: "",
      challenge: "",
      solution: "",
      testimonial: "",
      testimonialAuthor: "",
      metrics: [{ label: "", before: "", after: "", improvement: "" }]
    });
  };

  const addMetric = () => {
    setFormData(prev => ({
      ...prev,
      metrics: [...prev.metrics, { label: "", before: "", after: "", improvement: "" }]
    }));
  };

  const updateMetric = (index: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      metrics: prev.metrics.map((m, i) => i === index ? { ...m, [field]: value } : m)
    }));
  };

  const removeMetric = (index: number) => {
    setFormData(prev => ({
      ...prev,
      metrics: prev.metrics.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = () => {
    if (!selectedClient || !formData.title || !formData.challenge || !formData.solution) {
      toast.error("Please fill in all required fields");
      return;
    }
    createMutation.mutate({ ...formData, clientId: selectedClient });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Case Study Builder</h2>
          <p className="text-muted-foreground">Create compelling client success stories</p>
        </div>
        {!isCreating && (
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Case Study
          </Button>
        )}
      </div>

      {isCreating ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Create Case Study
            </CardTitle>
            <CardDescription>Build a portfolio piece showcasing client results</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Client *</Label>
                <Select value={selectedClient} onValueChange={setSelectedClient}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients?.map(client => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.business_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Industry</Label>
                <Input
                  value={formData.industry}
                  onChange={e => setFormData(prev => ({ ...prev, industry: e.target.value }))}
                  placeholder="e.g., Healthcare, Retail"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={generateWithAI} disabled={isGenerating || !selectedClient}>
                <Sparkles className="h-4 w-4 mr-2" />
                {isGenerating ? "Generating..." : "Generate with AI"}
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={formData.title}
                onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., How We Increased Leads by 300%"
              />
            </div>

            <div className="space-y-2">
              <Label>The Challenge *</Label>
              <Textarea
                value={formData.challenge}
                onChange={e => setFormData(prev => ({ ...prev, challenge: e.target.value }))}
                placeholder="Describe the client's problem..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Our Solution *</Label>
              <Textarea
                value={formData.solution}
                onChange={e => setFormData(prev => ({ ...prev, solution: e.target.value }))}
                placeholder="Describe how you solved it..."
                rows={3}
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Results Metrics
                </Label>
                <Button variant="outline" size="sm" onClick={addMetric}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Metric
                </Button>
              </div>
              {formData.metrics.map((metric, index) => (
                <div key={index} className="grid grid-cols-5 gap-2 items-end">
                  <Input
                    placeholder="Metric label"
                    value={metric.label}
                    onChange={e => updateMetric(index, "label", e.target.value)}
                  />
                  <Input
                    placeholder="Before"
                    value={metric.before}
                    onChange={e => updateMetric(index, "before", e.target.value)}
                  />
                  <Input
                    placeholder="After"
                    value={metric.after}
                    onChange={e => updateMetric(index, "after", e.target.value)}
                  />
                  <Input
                    placeholder="% Change"
                    value={metric.improvement}
                    onChange={e => updateMetric(index, "improvement", e.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMetric(index)}
                    disabled={formData.metrics.length === 1}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Client Testimonial</Label>
                <Textarea
                  value={formData.testimonial}
                  onChange={e => setFormData(prev => ({ ...prev, testimonial: e.target.value }))}
                  placeholder="What did the client say?"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Testimonial Author</Label>
                <Input
                  value={formData.testimonialAuthor}
                  onChange={e => setFormData(prev => ({ ...prev, testimonialAuthor: e.target.value }))}
                  placeholder="e.g., John Smith, CEO"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Case Study"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {isLoading ? (
            <p className="text-muted-foreground">Loading case studies...</p>
          ) : caseStudies?.length === 0 ? (
            <Card className="p-8 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No case studies yet. Create your first one!</p>
            </Card>
          ) : (
            caseStudies?.map(study => (
              <Card key={study.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{study.title}</h3>
                        <Badge variant={study.status === "published" ? "default" : "secondary"}>
                          {study.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {study.client_accounts?.business_name} • {study.industry}
                      </p>
                      <p className="text-sm text-muted-foreground line-clamp-2">{study.challenge}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => publishMutation.mutate({
                          id: study.id,
                          status: study.status === "published" ? "draft" : "published"
                        })}
                      >
                        {study.status === "published" ? "Unpublish" : "Publish"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(study.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
