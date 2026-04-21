import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Sparkles, 
  Target, 
  MapPin, 
  Briefcase,
  Copy,
  RefreshCw,
  Megaphone,
  FileText,
  Users,
  Image,
  Video,
  Loader2,
  CheckCircle,
  ExternalLink,
  Save,
  History,
  Download,
  FileDown,
  Building2,
  Beaker,
  TrendingUp,
  Search,
  LayoutTemplate,
  DollarSign,
  Calendar,
  Globe,
  BarChart3,
  ImagePlus,
  X,
  Eye,
  Trash2,
  Send,
  Play,
  Pause,
  CheckCircle2,
  Clock,
  AlertCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AiFixCard } from "@/components/admin/shared/AiFixCard";
import { toast } from "sonner";
import { handleEdgeError, friendlyEdgeMessage } from "@/lib/edge-error";

interface GeneratedAd {
  platform: "google" | "meta";
  headlines: string[];
  descriptions: string[];
  callToAction: string;
  targetAudience: {
    demographics: string;
    interests: string[];
    behaviors: string[];
  };
  landingPageCopy: {
    headline: string;
    subheadline: string;
    bodyText: string;
    ctaButton: string;
  };
  imagePrompts: string[];
  videoScriptOutline: string;
}

interface ABVariant {
  platform: string;
  variantName: string;
  headlines: string[];
  descriptions: string[];
  callToAction: string;
}

interface PerformancePredictions {
  estimatedCTR: string;
  estimatedConversionRate: string;
  qualityScorePrediction: number;
  competitionLevel: string;
  bestDays: string[];
  bestHours: string;
}

interface BudgetRecommendations {
  dailyBudgetRange: string;
  bidStrategy: string;
  monthlyProjections: {
    low: { budget: number; impressions: number; clicks: number; conversions: number };
    medium: { budget: number; impressions: number; clicks: number; conversions: number };
    high: { budget: number; impressions: number; clicks: number; conversions: number };
  };
  roiTips: string[];
}

interface SavedCampaign {
  id: string;
  name: string;
  goal: string;
  location: string;
  industry: string;
  budget?: string;
  platform: string;
  status: string;
  created_at: string;
  client_account_id?: string;
  client_name?: string;
  generated_ads: GeneratedAd[];
  ab_variants?: ABVariant[];
  performance_predictions?: PerformancePredictions;
  budget_recommendations?: BudgetRecommendations;
  landing_page_html?: string;
  generated_images?: string[];
  scheduled_start_date?: string;
  scheduled_end_date?: string;
}

interface ClientAccount {
  id: string;
  business_name: string;
}

interface AdTemplate {
  id: string;
  name: string;
  description: string;
  platform: string;
  ad_type: string;
  template_config: Record<string, unknown>;
}

export default function AIAdGenerator() {
  // Form state
  const [goal, setGoal] = useState("");
  const [location, setLocation] = useState("");
  const [industry, setIndustry] = useState("");
  const [budget, setBudget] = useState("");
  const [platform, setPlatform] = useState<"google" | "meta" | "both">("both");
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  
  // Competitor analysis
  const [competitorUrls, setCompetitorUrls] = useState<string[]>([]);
  const [newCompetitorUrl, setNewCompetitorUrl] = useState("");
  
  // Feature toggles
  const [generateVariants, setGenerateVariants] = useState(false);
  const [includePredictions, setIncludePredictions] = useState(false);
  const [includeBudgetRecs, setIncludeBudgetRecs] = useState(false);
  const [generateLandingPage, setGenerateLandingPage] = useState(false);
  
  // Scheduling
  const [scheduledStartDate, setScheduledStartDate] = useState("");
  const [scheduledEndDate, setScheduledEndDate] = useState("");
  
  // Loading states
  const [loading, setLoading] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [generatingImage, setGeneratingImage] = useState<string | null>(null);
  
  // Data
  const [generatedAds, setGeneratedAds] = useState<GeneratedAd[]>([]);
  const [abVariants, setAbVariants] = useState<ABVariant[]>([]);
  const [performancePredictions, setPerformancePredictions] = useState<PerformancePredictions | null>(null);
  const [budgetRecommendations, setBudgetRecommendations] = useState<BudgetRecommendations | null>(null);
  const [landingPageHtml, setLandingPageHtml] = useState<string>("");
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  
  // History & templates
  const [savedCampaigns, setSavedCampaigns] = useState<SavedCampaign[]>([]);
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [templates, setTemplates] = useState<AdTemplate[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showLandingPagePreview, setShowLandingPagePreview] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [showPushModal, setShowPushModal] = useState(false);
  const [pushingToPlatform, setPushingToPlatform] = useState<string | null>(null);
  const [currentCampaignId, setCurrentCampaignId] = useState<string | null>(null);

  useEffect(() => {
    fetchClients();
    fetchSavedCampaigns();
    fetchTemplates();
  }, []);

  // Refetch campaigns when client changes
  useEffect(() => {
    if (selectedClientId) {
      fetchSavedCampaigns(selectedClientId);
    }
  }, [selectedClientId]);

  const fetchClients = async () => {
    const { data, error } = await supabase
      .from("client_accounts")
      .select("id, business_name")
      .order("business_name");
    if (!error && data) setClients(data);
  };

  const fetchSavedCampaigns = async (clientId?: string) => {
    let query = supabase
      .from("ad_campaigns")
      .select(`
        *,
        client_accounts (
          business_name
        )
      `)
      .order("created_at", { ascending: false })
      .limit(50);
    
    // Filter by client if one is selected
    if (clientId) {
      query = query.eq("client_account_id", clientId);
    }
    
    const { data, error } = await query;
    
    if (!error && data) {
      setSavedCampaigns(data.map(c => ({
        ...c,
        client_name: (c.client_accounts as { business_name: string } | null)?.business_name,
        generated_ads: (c.generated_ads as unknown as GeneratedAd[]) || [],
        ab_variants: (c.ab_variants as unknown as ABVariant[]) || [],
        performance_predictions: c.performance_predictions as unknown as PerformancePredictions,
        budget_recommendations: c.budget_recommendations as unknown as BudgetRecommendations,
        generated_images: (c.generated_images as unknown as string[]) || [],
        scheduled_start_date: c.scheduled_start_date || undefined,
        scheduled_end_date: c.scheduled_end_date || undefined
      })));
    }
  };

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from("ad_templates")
      .select("*")
      .eq("is_active", true);
    if (!error && data) {
      setTemplates(data.map(t => ({
        ...t,
        template_config: t.template_config as Record<string, unknown>
      })));
    }
  };

  const generateAds = async () => {
    if (!goal || !location || !industry) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-ads", {
        body: { 
          goal, 
          location, 
          industry, 
          budget, 
          platform, 
          additionalInfo,
          competitorUrls,
          generateVariants,
          includePredictions,
          includeBudgetRecs,
          generateLandingPage
        }
      });

      const errMsg = handleEdgeError(error, data);
      if (errMsg) {
        console.error("Error generating ads:", errMsg);
        toast.error(friendlyEdgeMessage(errMsg));
        return;
      }
      
      setGeneratedAds(data.ads || []);
      setAbVariants(data.abVariants || []);
      setPerformancePredictions(data.performancePredictions || null);
      setBudgetRecommendations(data.budgetRecommendations || null);
      setLandingPageHtml(data.landingPageHtml || "");
      
      toast.success("Ads generated successfully!");
    } catch (error) {
      console.error("Error generating ads:", error);
      toast.error(error instanceof Error ? friendlyEdgeMessage(error.message) : "Failed to generate ads");
    } finally {
      setLoading(false);
    }
  };

  const saveCampaign = async () => {
    if (!campaignName) {
      toast.error("Please enter a campaign name");
      return;
    }
    if (generatedAds.length === 0) {
      toast.error("Generate ads first before saving");
      return;
    }

    setSavingCampaign(true);
    try {
      const { data, error } = await supabase
        .from("ad_campaigns")
        .insert([{
          name: campaignName,
          goal,
          location,
          industry,
          budget,
          platform,
          additional_info: additionalInfo,
          client_account_id: selectedClientId || null,
          competitor_urls: competitorUrls,
          generated_ads: JSON.parse(JSON.stringify(generatedAds)),
          ab_variants: JSON.parse(JSON.stringify(abVariants)),
          performance_predictions: performancePredictions ? JSON.parse(JSON.stringify(performancePredictions)) : null,
          budget_recommendations: budgetRecommendations ? JSON.parse(JSON.stringify(budgetRecommendations)) : null,
          landing_page_html: landingPageHtml,
          generated_images: generatedImages,
          scheduled_start_date: scheduledStartDate || null,
          scheduled_end_date: scheduledEndDate || null,
          status: scheduledStartDate ? "scheduled" : "draft"
        }])
        .select('id')
        .single();

      if (error) throw error;
      
      if (data) {
        setCurrentCampaignId(data.id);
      }
      
      toast.success("Campaign saved successfully!");
      fetchSavedCampaigns(selectedClientId || undefined);
    } catch (error) {
      console.error("Error saving campaign:", error);
      toast.error("Failed to save campaign");
    } finally {
      setSavingCampaign(false);
    }
  };

  const loadCampaign = (campaign: SavedCampaign) => {
    setGoal(campaign.goal);
    setLocation(campaign.location);
    setIndustry(campaign.industry);
    setBudget(campaign.budget || "");
    setPlatform(campaign.platform as "google" | "meta" | "both");
    setCampaignName(campaign.name);
    setSelectedClientId(campaign.client_account_id || "");
    setGeneratedAds(campaign.generated_ads);
    setAbVariants(campaign.ab_variants || []);
    setPerformancePredictions(campaign.performance_predictions || null);
    setBudgetRecommendations(campaign.budget_recommendations || null);
    setLandingPageHtml(campaign.landing_page_html || "");
    setGeneratedImages(campaign.generated_images || []);
    setScheduledStartDate(campaign.scheduled_start_date || "");
    setScheduledEndDate(campaign.scheduled_end_date || "");
    setCurrentCampaignId(campaign.id);
    setShowHistory(false);
    toast.success("Campaign loaded");
  };

  const deleteCampaign = async (id: string) => {
    try {
      const { error } = await supabase
        .from("ad_campaigns")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Campaign deleted");
      fetchSavedCampaigns(selectedClientId || undefined);
    } catch (error) {
      toast.error("Failed to delete campaign");
    }
  };

  const updateCampaignStatus = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("ad_campaigns")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast.success(`Campaign ${newStatus === 'active' ? 'activated' : newStatus === 'paused' ? 'paused' : 'updated'}`);
      fetchSavedCampaigns(selectedClientId || undefined);
    } catch (error) {
      toast.error("Failed to update campaign status");
    }
  };

  const pushToPlatform = async (platformType: "google" | "meta") => {
    if (!currentCampaignId && generatedAds.length === 0) {
      toast.error("Please generate or load a campaign first");
      return;
    }
    
    setPushingToPlatform(platformType);
    
    // Simulate push delay - in production this would call actual APIs
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // For now, we'll update status and show success
    // Real implementation would require Google Ads API / Meta Marketing API credentials
    if (currentCampaignId) {
      await updateCampaignStatus(currentCampaignId, 'active');
    }
    
    setPushingToPlatform(null);
    setShowPushModal(false);
    toast.success(`Campaign pushed to ${platformType === 'google' ? 'Google Ads' : 'Meta Ads'}! Check your ${platformType === 'google' ? 'Google Ads' : 'Meta Business Suite'} dashboard.`);
  };

  const getGoogleAdsExport = () => {
    if (generatedAds.length === 0) return "";
    const googleAd = generatedAds.find(ad => ad.platform === "google") || generatedAds[0];
    return `Campaign Name: ${campaignName}
Type: Search Campaign
Location: ${location}
Industry: ${industry}

=== HEADLINES (max 30 chars each) ===
${googleAd.headlines.map((h, i) => `Headline ${i + 1}: ${h}`).join("\n")}

=== DESCRIPTIONS (max 90 chars each) ===
${googleAd.descriptions.map((d, i) => `Description ${i + 1}: ${d}`).join("\n")}

=== TARGETING ===
Demographics: ${googleAd.targetAudience.demographics}
Keywords/Interests: ${googleAd.targetAudience.interests.join(", ")}

=== CALL TO ACTION ===
${googleAd.callToAction}`;
  };

  const getMetaAdsExport = () => {
    if (generatedAds.length === 0) return "";
    const metaAd = generatedAds.find(ad => ad.platform === "meta") || generatedAds[0];
    return `Campaign Name: ${campaignName}
Objective: ${goal}
Location: ${location}

=== PRIMARY TEXT ===
${metaAd.descriptions[0] || ""}

=== HEADLINE ===
${metaAd.headlines[0] || ""}

=== DESCRIPTION ===
${metaAd.descriptions[1] || metaAd.descriptions[0] || ""}

=== CALL TO ACTION ===
${metaAd.callToAction}

=== AUDIENCE TARGETING ===
Demographics: ${metaAd.targetAudience.demographics}
Interests: ${metaAd.targetAudience.interests.join(", ")}
Behaviors: ${metaAd.targetAudience.behaviors.join(", ")}

=== IMAGE PROMPTS FOR CREATIVES ===
${metaAd.imagePrompts.join("\n")}`;
  };

  const generateImageFromPrompt = async (prompt: string) => {
    setGeneratingImage(prompt);
    try {
      const { data, error } = await supabase.functions.invoke("generate-ads", {
        body: { 
          generateImageOnly: true,
          imagePrompt: prompt
        }
      });
      
      const errMsg = handleEdgeError(error, data);
      if (errMsg) {
        console.error("Error generating image:", errMsg);
        toast.error(friendlyEdgeMessage(errMsg));
        return;
      }
      if (data.imageUrl) {
        setGeneratedImages(prev => [...prev, data.imageUrl]);
        toast.success("Image generated!");
      }
    } catch (error) {
      console.error("Error generating image:", error);
      toast.error(error instanceof Error ? friendlyEdgeMessage(error.message) : "Failed to generate image");
    } finally {
      setGeneratingImage(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  const copyAllContent = () => {
    const content = generatedAds.map(ad => `
=== ${ad.platform.toUpperCase()} ADS ===

HEADLINES:
${ad.headlines.join("\n")}

DESCRIPTIONS:
${ad.descriptions.join("\n")}

CALL TO ACTION: ${ad.callToAction}

TARGET AUDIENCE:
${ad.targetAudience.demographics}
Interests: ${ad.targetAudience.interests.join(", ")}
Behaviors: ${ad.targetAudience.behaviors.join(", ")}

LANDING PAGE COPY:
${ad.landingPageCopy.headline}
${ad.landingPageCopy.subheadline}
${ad.landingPageCopy.bodyText}
CTA: ${ad.landingPageCopy.ctaButton}

IMAGE PROMPTS:
${ad.imagePrompts.join("\n")}

VIDEO SCRIPT:
${ad.videoScriptOutline}
    `).join("\n\n");
    
    copyToClipboard(content);
  };

  const exportToCsv = () => {
    const rows = [
      ["Platform", "Type", "Content"],
      ...generatedAds.flatMap(ad => [
        ...ad.headlines.map(h => [ad.platform, "Headline", h]),
        ...ad.descriptions.map(d => [ad.platform, "Description", d]),
        [ad.platform, "CTA", ad.callToAction],
      ])
    ];
    
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ad-campaign-${Date.now()}.csv`;
    a.click();
    toast.success("Exported to CSV");
  };

  const addCompetitorUrl = () => {
    if (newCompetitorUrl && !competitorUrls.includes(newCompetitorUrl)) {
      setCompetitorUrls([...competitorUrls, newCompetitorUrl]);
      setNewCompetitorUrl("");
    }
  };

  const removeCompetitorUrl = (url: string) => {
    setCompetitorUrls(competitorUrls.filter(u => u !== url));
  };

  const industries = [
    "Home Services", "Healthcare", "Legal", "Real Estate", "Restaurants",
    "Automotive", "Fitness", "Beauty & Wellness", "Professional Services",
    "Retail", "Education", "Financial Services", "Technology", "Other"
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" />
            AI Ad Generator
          </h2>
          <p className="text-muted-foreground">
            Generate complete ad campaigns for Meta & Google with AI
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showHistory} onOpenChange={setShowHistory}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <History className="h-4 w-4 mr-2" />
                History
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Saved Campaigns</DialogTitle>
                <DialogDescription>
                  View, manage and push your ad campaigns to platforms
                  {selectedClientId && clients.find(c => c.id === selectedClientId) && (
                    <span className="ml-2 text-primary">
                      (Showing campaigns for {clients.find(c => c.id === selectedClientId)?.business_name})
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2 pb-2 border-b">
                <Label className="text-sm">Filter by Client:</Label>
                <Select 
                  value={selectedClientId || "__all__"} 
                  onValueChange={(v) => {
                    const newClientId = v === "__all__" ? "" : v;
                    setSelectedClientId(newClientId);
                    fetchSavedCampaigns(newClientId || undefined);
                  }}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All clients" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Clients</SelectItem>
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.business_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ScrollArea className="h-[450px]">
                {savedCampaigns.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No saved campaigns yet</p>
                ) : (
                  <div className="space-y-3">
                    {savedCampaigns.map(campaign => (
                      <div key={campaign.id} className="p-4 border rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium">{campaign.name}</h4>
                              <Badge 
                                variant={
                                  campaign.status === 'active' ? 'default' :
                                  campaign.status === 'scheduled' ? 'secondary' :
                                  campaign.status === 'paused' ? 'outline' :
                                  campaign.status === 'completed' ? 'default' : 'outline'
                                }
                                className={
                                  campaign.status === 'active' ? 'bg-green-500' :
                                  campaign.status === 'completed' ? 'bg-blue-500' : ''
                                }
                              >
                                {campaign.status === 'active' && <Play className="h-3 w-3 mr-1" />}
                                {campaign.status === 'paused' && <Pause className="h-3 w-3 mr-1" />}
                                {campaign.status === 'scheduled' && <Clock className="h-3 w-3 mr-1" />}
                                {campaign.status === 'completed' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                                {campaign.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {campaign.industry} • {campaign.location} • {new Date(campaign.created_at).toLocaleDateString()}
                            </p>
                            {(campaign.scheduled_start_date || campaign.scheduled_end_date) && (
                              <p className="text-xs text-muted-foreground mt-1">
                                <Calendar className="h-3 w-3 inline mr-1" />
                                {campaign.scheduled_start_date && `Start: ${new Date(campaign.scheduled_start_date).toLocaleDateString()}`}
                                {campaign.scheduled_start_date && campaign.scheduled_end_date && ' → '}
                                {campaign.scheduled_end_date && `End: ${new Date(campaign.scheduled_end_date).toLocaleDateString()}`}
                              </p>
                            )}
                            <div className="flex gap-1 mt-2 flex-wrap">
                              <Badge variant="outline" className="text-xs">{campaign.platform}</Badge>
                              {campaign.client_name ? (
                                <Badge variant="secondary" className="text-xs">
                                  <Building2 className="h-3 w-3 mr-1" />
                                  {campaign.client_name}
                                </Badge>
                              ) : campaign.client_account_id && (
                                <Badge variant="secondary" className="text-xs">
                                  <Building2 className="h-3 w-3 mr-1" />
                                  Client linked
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3 pt-3 border-t">
                          <Button size="sm" variant="outline" onClick={() => { loadCampaign(campaign); setCurrentCampaignId(campaign.id); }}>
                            <Eye className="h-4 w-4 mr-1" />
                            Load
                          </Button>
                          {campaign.status === 'draft' && (
                            <Button size="sm" variant="default" onClick={() => { setCurrentCampaignId(campaign.id); loadCampaign(campaign); setShowPushModal(true); setShowHistory(false); }}>
                              <Send className="h-4 w-4 mr-1" />
                              Push to Platform
                            </Button>
                          )}
                          {campaign.status === 'active' && (
                            <Button size="sm" variant="outline" onClick={() => updateCampaignStatus(campaign.id, 'paused')}>
                              <Pause className="h-4 w-4 mr-1" />
                              Pause
                            </Button>
                          )}
                          {campaign.status === 'paused' && (
                            <Button size="sm" variant="outline" onClick={() => updateCampaignStatus(campaign.id, 'active')}>
                              <Play className="h-4 w-4 mr-1" />
                              Resume
                            </Button>
                          )}
                          {(campaign.status === 'active' || campaign.status === 'paused') && (
                            <Button size="sm" variant="outline" onClick={() => updateCampaignStatus(campaign.id, 'completed')}>
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Complete
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => deleteCampaign(campaign.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </DialogContent>
          </Dialog>
          
          {generatedAds.length > 0 && (
            <>
              <Button variant="default" size="sm" onClick={() => setShowPushModal(true)}>
                <Send className="h-4 w-4 mr-2" />
                Push to Platform
              </Button>
              <Button variant="outline" size="sm" onClick={copyAllContent}>
                <Copy className="h-4 w-4 mr-2" />
                Copy All
              </Button>
              <Button variant="outline" size="sm" onClick={exportToCsv}>
                <FileDown className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </>
          )}
        </div>

        {/* Push to Platform Modal */}
        <Dialog open={showPushModal} onOpenChange={setShowPushModal}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Push Campaign to Advertising Platform
              </DialogTitle>
              <DialogDescription>
                Export your campaign to Google Ads or Meta Ads Manager
              </DialogDescription>
            </DialogHeader>
            
            <Tabs defaultValue="google" className="mt-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="google">🔍 Google Ads</TabsTrigger>
                <TabsTrigger value="meta">📱 Meta Ads</TabsTrigger>
              </TabsList>
              
              <TabsContent value="google" className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">Google Ads Export</h4>
                  <pre className="text-xs whitespace-pre-wrap max-h-48 overflow-auto bg-background p-3 rounded border">
                    {getGoogleAdsExport()}
                  </pre>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => copyToClipboard(getGoogleAdsExport())}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy for Google Ads
                  </Button>
                  <Button onClick={() => pushToPlatform("google")} disabled={pushingToPlatform === "google"}>
                    {pushingToPlatform === "google" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4 mr-2" />
                    )}
                    Open Google Ads
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  <AlertCircle className="h-3 w-3 inline mr-1" />
                  Copy the content above and paste into Google Ads Editor or create a new campaign in Google Ads dashboard.
                </p>
              </TabsContent>
              
              <TabsContent value="meta" className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">Meta Ads Export</h4>
                  <pre className="text-xs whitespace-pre-wrap max-h-48 overflow-auto bg-background p-3 rounded border">
                    {getMetaAdsExport()}
                  </pre>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => copyToClipboard(getMetaAdsExport())}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy for Meta Ads
                  </Button>
                  <Button onClick={() => pushToPlatform("meta")} disabled={pushingToPlatform === "meta"}>
                    {pushingToPlatform === "meta" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4 mr-2" />
                    )}
                    Open Meta Business Suite
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  <AlertCircle className="h-3 w-3 inline mr-1" />
                  Copy the content above and use it to create a new campaign in Meta Business Suite / Ads Manager.
                </p>
              </TabsContent>
            </Tabs>
            
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setShowPushModal(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Input Form */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Campaign Details
            </CardTitle>
            <CardDescription>
              Provide details for your ad campaign
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="campaignName">Campaign Name</Label>
              <Input
                id="campaignName"
                placeholder="e.g., Summer Roofing Promo"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="client">Link to Client (optional)</Label>
              <Select value={selectedClientId || "__none__"} onValueChange={(v) => setSelectedClientId(v === "__none__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No client</SelectItem>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.business_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal">Campaign Goal *</Label>
              <Textarea
                id="goal"
                placeholder="e.g., Generate leads for roof repair services, Increase brand awareness, Drive website traffic..."
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Target Location *</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="location"
                  className="pl-10"
                  placeholder="e.g., Knoxville, TN"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="industry">Industry *</Label>
              <Select value={industry} onValueChange={setIndustry}>
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

            <div className="space-y-2">
              <Label htmlFor="budget">Monthly Budget (optional)</Label>
              <Input
                id="budget"
                placeholder="e.g., $500, $1000-2000"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Platform</Label>
              <Select value={platform} onValueChange={(v: "google" | "meta" | "both") => setPlatform(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Both Google & Meta</SelectItem>
                  <SelectItem value="google">Google Ads Only</SelectItem>
                  <SelectItem value="meta">Meta Ads Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Ad Template (optional)</Label>
              <Select value={selectedTemplate || "__none__"} onValueChange={(v) => setSelectedTemplate(v === "__none__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No template</SelectItem>
                  {templates.map(template => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} ({template.platform})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="additional">Additional Info (optional)</Label>
              <Textarea
                id="additional"
                placeholder="Any specific offers, unique selling points, or requirements..."
                value={additionalInfo}
                onChange={(e) => setAdditionalInfo(e.target.value)}
                rows={2}
              />
            </div>

            {/* Competitor Analysis */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                Competitor URLs
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://competitor.com"
                  value={newCompetitorUrl}
                  onChange={(e) => setNewCompetitorUrl(e.target.value)}
                />
                <Button variant="outline" size="sm" onClick={addCompetitorUrl}>Add</Button>
              </div>
              {competitorUrls.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {competitorUrls.map(url => (
                    <Badge key={url} variant="secondary" className="text-xs">
                      {new URL(url).hostname}
                      <button onClick={() => removeCompetitorUrl(url)} className="ml-1">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Feature toggles */}
            <div className="space-y-3 border-t pt-4">
              <Label className="text-sm font-medium">Advanced Features</Label>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Beaker className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">A/B Variants</span>
                </div>
                <Switch checked={generateVariants} onCheckedChange={setGenerateVariants} />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Performance Predictions</span>
                </div>
                <Switch checked={includePredictions} onCheckedChange={setIncludePredictions} />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Budget Recommendations</span>
                </div>
                <Switch checked={includeBudgetRecs} onCheckedChange={setIncludeBudgetRecs} />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Landing Page Generator</span>
                </div>
                <Switch checked={generateLandingPage} onCheckedChange={setGenerateLandingPage} />
              </div>
            </div>

            {/* Scheduling */}
            <div className="space-y-2 border-t pt-4">
              <Label className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Schedule Campaign
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Start Date</Label>
                  <Input
                    type="date"
                    value={scheduledStartDate}
                    onChange={(e) => setScheduledStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">End Date</Label>
                  <Input
                    type="date"
                    value={scheduledEndDate}
                    onChange={(e) => setScheduledEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button 
                className="flex-1" 
                onClick={generateAds}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate
                  </>
                )}
              </Button>
              
              {generatedAds.length > 0 && (
                <Button 
                  variant="secondary"
                  onClick={saveCampaign}
                  disabled={savingCampaign}
                >
                  {savingCampaign ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Generated Ads */}
        <div className="lg:col-span-2 space-y-4">
          {generatedAds.length === 0 ? (
            <Card className="p-12 text-center">
              <Megaphone className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Ads Generated Yet</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Fill in the campaign details and click "Generate" to create 
                complete ad campaigns for Google and Meta platforms.
              </p>
            </Card>
          ) : (
            <>
              {/* Performance Predictions */}
              {performancePredictions && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TrendingUp className="h-5 w-5 text-green-500" />
                      Performance Predictions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-3 bg-muted rounded-lg">
                        <div className="text-2xl font-bold text-green-600">{performancePredictions.estimatedCTR}</div>
                        <div className="text-xs text-muted-foreground">Est. CTR</div>
                      </div>
                      <div className="text-center p-3 bg-muted rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">{performancePredictions.estimatedConversionRate}</div>
                        <div className="text-xs text-muted-foreground">Conv. Rate</div>
                      </div>
                      <div className="text-center p-3 bg-muted rounded-lg">
                        <div className="text-2xl font-bold text-purple-600">{performancePredictions.qualityScorePrediction}/10</div>
                        <div className="text-xs text-muted-foreground">Quality Score</div>
                      </div>
                      <div className="text-center p-3 bg-muted rounded-lg">
                        <div className="text-lg font-bold">{performancePredictions.competitionLevel}</div>
                        <div className="text-xs text-muted-foreground">Competition</div>
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-muted-foreground">
                      <strong>Best days:</strong> {performancePredictions.bestDays.join(", ")} • <strong>Best hours:</strong> {performancePredictions.bestHours}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Budget Recommendations */}
              {budgetRecommendations && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <DollarSign className="h-5 w-5 text-emerald-500" />
                      Budget Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="font-medium">Recommended Daily Budget</span>
                        <Badge variant="secondary">{budgetRecommendations.dailyBudgetRange}</Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="font-medium">Bid Strategy</span>
                        <span className="text-sm">{budgetRecommendations.bidStrategy}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {Object.entries(budgetRecommendations.monthlyProjections).map(([level, data]) => (
                          <div key={level} className="p-3 border rounded-lg text-center">
                            <div className="font-medium capitalize">{level}</div>
                            <div className="text-lg font-bold">${data.budget}/mo</div>
                            <div className="text-xs text-muted-foreground">
                              {data.impressions.toLocaleString()} impr. • {data.clicks} clicks • {data.conversions} conv.
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2">
                        <span className="text-sm font-medium">ROI Tips:</span>
                        <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                          {budgetRecommendations.roiTips.map((tip, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Landing Page Preview */}
              {landingPageHtml && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <div className="flex items-center gap-2">
                        <Globe className="h-5 w-5" />
                        Generated Landing Page
                      </div>
                      <Dialog open={showLandingPagePreview} onOpenChange={setShowLandingPagePreview}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Eye className="h-4 w-4 mr-2" />
                            Preview
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl h-[80vh]">
                          <DialogHeader>
                            <DialogTitle>Landing Page Preview</DialogTitle>
                          </DialogHeader>
                          <iframe
                            srcDoc={landingPageHtml}
                            className="w-full h-full border rounded"
                            title="Landing Page Preview"
                          />
                        </DialogContent>
                      </Dialog>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard(landingPageHtml)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy HTML
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => {
                        const blob = new Blob([landingPageHtml], { type: "text/html" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "landing-page.html";
                        a.click();
                      }}>
                        <Download className="h-4 w-4 mr-2" />
                        Download HTML
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Generated Images */}
              {generatedImages.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ImagePlus className="h-5 w-5" />
                      Generated Images
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-2">
                      {generatedImages.map((img, i) => (
                        <img key={i} src={img} alt={`Generated ad ${i + 1}`} className="rounded-lg w-full h-32 object-cover" />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* A/B Variants */}
              {abVariants.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Beaker className="h-5 w-5 text-purple-500" />
                      A/B Test Variants
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3">
                      {abVariants.map((variant, i) => (
                        <div key={i} className="p-3 border rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge>{variant.platform}</Badge>
                            <span className="font-medium">{variant.variantName}</span>
                          </div>
                          <div className="space-y-1 text-sm">
                            {variant.headlines.map((h, j) => (
                              <div key={j} className="flex items-center justify-between bg-muted p-2 rounded">
                                <span>{h}</span>
                                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(h)}>
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Main Ads Tabs */}
              <Tabs defaultValue={generatedAds[0]?.platform} className="space-y-4">
                <TabsList>
                  {generatedAds.map((ad, i) => (
                    <TabsTrigger key={i} value={ad.platform} className="flex items-center gap-2">
                      {ad.platform === "google" ? "🔍 Google Ads" : "📱 Meta Ads"}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {generatedAds.map((ad, i) => (
                  <TabsContent key={i} value={ad.platform} className="space-y-4">
                    {selectedClientId && (
                      <AiFixCard
                        clientAccountId={selectedClientId}
                        source="ads"
                        sourceReferenceId={`${currentCampaignId || 'draft'}:${ad.platform}`}
                        issueTitle={`Improve ${ad.platform === 'google' ? 'Google' : 'Meta'} ad — ${campaignName || 'Untitled'}`}
                        issueSummary="Get an AI critique and rewrite suggestions for this ad's headlines, descriptions, and CTA."
                        severity="medium"
                        context={{ platform: ad.platform, headlines: ad.headlines, descriptions: ad.descriptions, callToAction: ad.callToAction, goal, industry, location }}
                        compact
                      />
                    )}
                    {/* Headlines & Descriptions */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <FileText className="h-5 w-5" />
                          Ad Copy
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <Label className="text-sm font-medium mb-2 block">Headlines</Label>
                          <div className="space-y-2">
                            {ad.headlines.map((headline, j) => (
                              <div key={j} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                                <span className="font-medium">{headline}</span>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => copyToClipboard(headline)}
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <Label className="text-sm font-medium mb-2 block">Descriptions</Label>
                          <div className="space-y-2">
                            {ad.descriptions.map((desc, j) => (
                              <div key={j} className="flex items-start justify-between p-3 bg-muted rounded-lg">
                                <span className="text-sm">{desc}</span>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => copyToClipboard(desc)}
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Label className="text-sm font-medium">Call to Action:</Label>
                          <Badge variant="secondary">{ad.callToAction}</Badge>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Target Audience */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Users className="h-5 w-5" />
                          Target Audience
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <Label className="text-sm font-medium mb-2 block">Demographics</Label>
                          <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                            {ad.targetAudience.demographics}
                          </p>
                        </div>

                        <div>
                          <Label className="text-sm font-medium mb-2 block">Interests</Label>
                          <div className="flex flex-wrap gap-2">
                            {ad.targetAudience.interests.map((interest, j) => (
                              <Badge key={j} variant="outline">{interest}</Badge>
                            ))}
                          </div>
                        </div>

                        <div>
                          <Label className="text-sm font-medium mb-2 block">Behaviors</Label>
                          <div className="flex flex-wrap gap-2">
                            {ad.targetAudience.behaviors.map((behavior, j) => (
                              <Badge key={j} variant="secondary">{behavior}</Badge>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Landing Page Copy */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <ExternalLink className="h-5 w-5" />
                          Landing Page Copy
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="p-4 border rounded-lg space-y-3">
                          <h3 className="text-xl font-bold">{ad.landingPageCopy.headline}</h3>
                          <p className="text-lg text-muted-foreground">{ad.landingPageCopy.subheadline}</p>
                          <p className="text-sm">{ad.landingPageCopy.bodyText}</p>
                          <Button className="w-full sm:w-auto">
                            {ad.landingPageCopy.ctaButton}
                          </Button>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => copyToClipboard(
                            `${ad.landingPageCopy.headline}\n\n${ad.landingPageCopy.subheadline}\n\n${ad.landingPageCopy.bodyText}`
                          )}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copy All
                        </Button>
                      </CardContent>
                    </Card>

                    {/* Creative Suggestions */}
                    <div className="grid gap-4 md:grid-cols-2">
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-base">
                            <Image className="h-4 w-4" />
                            Image Prompts
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-3 text-sm">
                            {ad.imagePrompts.map((prompt, j) => (
                              <li key={j} className="space-y-2">
                                <div className="flex items-start gap-2">
                                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                                  <span>{prompt}</span>
                                </div>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="w-full"
                                  disabled={generatingImage === prompt}
                                  onClick={() => generateImageFromPrompt(prompt)}
                                >
                                  {generatingImage === prompt ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <ImagePlus className="h-4 w-4 mr-2" />
                                  )}
                                  Generate Image
                                </Button>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-base">
                            <Video className="h-4 w-4" />
                            Video Script Outline
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm whitespace-pre-line">{ad.videoScriptOutline}</p>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="mt-3"
                            onClick={() => copyToClipboard(ad.videoScriptOutline)}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Copy Script
                          </Button>
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
