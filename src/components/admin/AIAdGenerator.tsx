import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
  ExternalLink
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

export default function AIAdGenerator() {
  const [goal, setGoal] = useState("");
  const [location, setLocation] = useState("");
  const [industry, setIndustry] = useState("");
  const [budget, setBudget] = useState("");
  const [platform, setPlatform] = useState<"google" | "meta" | "both">("both");
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedAds, setGeneratedAds] = useState<GeneratedAd[]>([]);

  const generateAds = async () => {
    if (!goal || !location || !industry) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-ads", {
        body: { goal, location, industry, budget, platform, additionalInfo }
      });

      if (error) throw error;
      setGeneratedAds(data.ads || []);
      toast.success("Ads generated successfully!");
    } catch (error) {
      console.error("Error generating ads:", error);
      toast.error("Failed to generate ads");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
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
              <Label htmlFor="additional">Additional Info (optional)</Label>
              <Textarea
                id="additional"
                placeholder="Any specific offers, unique selling points, or requirements..."
                value={additionalInfo}
                onChange={(e) => setAdditionalInfo(e.target.value)}
                rows={2}
              />
            </div>

            <Button 
              className="w-full" 
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
                  Generate Ads
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Generated Ads */}
        <div className="lg:col-span-2 space-y-4">
          {generatedAds.length === 0 ? (
            <Card className="p-12 text-center">
              <Megaphone className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Ads Generated Yet</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Fill in the campaign details and click "Generate Ads" to create 
                complete ad campaigns for Google and Meta platforms.
              </p>
            </Card>
          ) : (
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
                        <ul className="space-y-2 text-sm">
                          {ad.imagePrompts.map((prompt, j) => (
                            <li key={j} className="flex items-start gap-2">
                              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                              <span>{prompt}</span>
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
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
