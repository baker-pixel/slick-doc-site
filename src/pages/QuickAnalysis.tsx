import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { motion } from "framer-motion";
import { Globe, Zap, Search, MousePointer, Gauge, Loader2, CheckCircle, Download, Calendar, Mail, User, Building2, ArrowRight } from "lucide-react";
import { downloadReportPdf } from "@/lib/downloadReportPdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { scoreToStatus, mapPriority, type ReportData } from "@/components/report/ReportConfig";
import { ReportView } from "@/components/report/ReportView";

interface QuickWin {
  title: string;
  description: string;
  impact: "high" | "medium";
  effort: "low" | "medium";
}

interface ActionPlan {
  week1: { title: string; tasks: string[] };
  week2to4: { title: string; tasks: string[] };
  month2to3: { title: string; tasks: string[] };
}

interface AnalysisResult {
  overallScore: number;
  seo: { score: number; findings: string[]; recommendations: string[] };
  conversion: { score: number; findings: string[]; recommendations: string[] };
  technical: { score: number; findings: string[]; recommendations: string[] };
  quickWins?: QuickWin[];
  actionPlan?: ActionPlan;
  summary: string;
  /** Ground-truth (parsed, not LLM-guessed) present/missing tags — use these for strengths/gaps, never raw findings. */
  detectedStrengths?: string[];
  detectedGaps?: string[];
}

const BUSINESS_TYPES = [
  "Restaurant",
  "Retail",
  "Professional Services",
  "Healthcare",
  "Other",
];

function getTier(score: number): "transformation" | "growth" | "optimization" {
  if (score <= 39) return "transformation";
  if (score <= 64) return "growth";
  return "optimization";
}

function getTierLabel(tier: string) {
  switch (tier) {
    case "transformation": return "Transformation";
    case "growth": return "Growth";
    case "optimization": return "Optimization";
    default: return tier;
  }
}

function getTierColor(tier: string) {
  switch (tier) {
    case "transformation": return "text-red-600 bg-red-50 border-red-200";
    case "growth": return "text-amber-600 bg-amber-50 border-amber-200";
    case "optimization": return "text-green-600 bg-green-50 border-green-200";
    default: return "";
  }
}

const QuickAnalysis = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [url, setUrl] = useState("");
  const [validatedUrl, setValidatedUrl] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [prospectId, setProspectId] = useState<string | null>(null);
  const [aiReadinessScore, setAiReadinessScore] = useState<number | undefined>(undefined);
  const [isDownloading, setIsDownloading] = useState(false);
  const { toast } = useToast();

  // Step 1: URL submission
  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) {
      toast({ title: "URL Required", description: "Please enter a website URL to analyze.", variant: "destructive" });
      return;
    }
    let vUrl = url;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      vUrl = "https://" + url;
    }
    try { new URL(vUrl); } catch {
      toast({ title: "Invalid URL", description: "Please enter a valid website URL.", variant: "destructive" });
      return;
    }
    setValidatedUrl(vUrl);
    setStep(2);
  };

  // Step 2: Email gate submission
  const handleEmailGate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) {
      toast({ title: "Required Fields", description: "Please enter your name and email.", variant: "destructive" });
      return;
    }

    setIsAnalyzing(true);

    try {
      const { data, error } = await supabase.functions.invoke("analyze-website", {
        body: {
          url: validatedUrl,
          industry: businessType || undefined,
          prospect: {
            name,
            email,
            businessType: businessType || null,
          },
        },
      });

      if (error) throw error;
      if (!data?.analysis) throw new Error("No analysis data returned");

      const analysis: AnalysisResult = data.analysis;
      const pId = data?.prospectId ?? null;
      setProspectId(pId);
      setResult(analysis);
      setStep(3);

      if (pId) {
        supabase.functions
          .invoke("send-prospect-report", {
            body: { prospectId: pId },
          })
          .catch((err) => console.error("Failed to send prospect report email:", err));

        supabase
          .from("ai_readiness_scores")
          .select("total_score")
          .eq("prospect_id", pId)
          .maybeSingle()
          .then(({ data: readiness }) => {
            if (readiness) setAiReadinessScore(readiness.total_score);
          });
      }

      toast({ title: "Analysis Complete", description: "Your website analysis is ready!" });
    } catch (error) {
      console.error("Analysis error:", error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to analyze website. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Shared building blocks for both the on-screen report and the PDF --
  // one definition of "what strengths/gaps/actions this analysis produced,"
  // not two that could drift.
  const buildStrengths = (r: AnalysisResult): string[] =>
    (r.detectedStrengths?.length ? r.detectedStrengths : r.seo.findings).slice(0, 4);

  const buildGaps = (r: AnalysisResult): string[] =>
    (r.detectedGaps?.length
      ? r.detectedGaps
      : [...r.seo.recommendations.slice(0, 1), ...r.conversion.recommendations.slice(0, 1), ...r.technical.recommendations.slice(0, 1)]
    ).slice(0, 4);

  const buildActions = (r: AnalysisResult) => {
    const items: { title: string; description: string; tag: "Quick Win" | "Medium Term" | "Long Term" }[] = [
      ...(r.quickWins?.map((w) => ({ title: w.title, description: w.description, tag: "Quick Win" as const })) || []),
      ...(r.actionPlan?.week1.tasks.map((t) => ({ title: t, description: "", tag: "Quick Win" as const })) || []),
      ...(r.actionPlan?.week2to4.tasks.map((t) => ({ title: t, description: "", tag: "Medium Term" as const })) || []),
      ...(r.actionPlan?.month2to3.tasks.map((t) => ({ title: t, description: "", tag: "Long Term" as const })) || []),
    ];
    if (items.length > 0) return items;
    // No structured quick-wins/action-plan came back -- fall back to the raw recommendations.
    return [...r.seo.recommendations, ...r.conversion.recommendations, ...r.technical.recommendations]
      .map((rec, i) => ({ title: rec, description: "", tag: mapPriority("", i) }));
  };

  const buildCategoryScores = (r: AnalysisResult) => [
    { label: "SEO & Visibility", score: r.seo.score, status: scoreToStatus(r.seo.score) },
    { label: "Conversion Elements", score: r.conversion.score, status: scoreToStatus(r.conversion.score) },
    { label: "Technical Performance", score: r.technical.score, status: scoreToStatus(r.technical.score) },
  ];

  const reportViewData: ReportData | null = result
    ? {
        businessName: name || url,
        clientDomain: validatedUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""),
        reportDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
        overallScore: result.overallScore,
        aiReadinessScore,
        executiveSummary: result.summary,
        categoryScores: buildCategoryScores(result),
        strengths: buildStrengths(result),
        gaps: buildGaps(result),
        actions: buildActions(result),
      }
    : null;

  const downloadPDF = async () => {
    if (!reportViewData || isDownloading) return;
    setIsDownloading(true);
    try {
      await downloadReportPdf(reportViewData);
    } catch (err) {
      console.error("Failed to download PDF:", err);
      toast({ title: "PDF download failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  };

  // Mark prospect as converted
  const handleConvert = async (action: "call" | "signup") => {
    if (prospectId) {
      await supabase
        .from("prospects" as any)
        .update({ status: "converted", converted_at: new Date().toISOString() } as any)
        .eq("id", prospectId);
    }
    if (action === "call") {
      navigate("/schedule");
    } else {
      navigate("/pricing");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pt-20">
        {/* Hero */}
        <section className="section-padding bg-gradient-to-b from-cream to-background">
          <div className="container-wide mx-auto">
            <div className="mb-4">
              <BackButton />
            </div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto text-center">
              <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
                AI-Powered Analysis
              </span>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-semibold text-foreground mb-4">
                Free Website Marketing Check-Up
              </h1>
              <p className="text-muted-foreground text-lg mb-8">
                Find out exactly what&apos;s working, what&apos;s not, and what to fix first — explained in plain English.
              </p>

              {/* Progress indicator */}
              <div className="flex items-center justify-center gap-2 mb-8">
                {[1, 2, 3].map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                      step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                      {step > s ? <CheckCircle className="h-4 w-4" /> : s}
                    </div>
                    {s < 3 && <div className={`w-8 h-0.5 ${step > s ? "bg-primary" : "bg-muted"}`} />}
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Step Content */}
        <section className="section-padding pb-24">
          <div className="container-wide mx-auto max-w-2xl">

            {/* STEP 1 — URL Input */}
            {step === 1 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="border-border shadow-lg">
                  <CardContent className="p-6 sm:p-10">
                    <div className="text-center mb-6">
                      <Globe className="h-12 w-12 text-primary mx-auto mb-3" />
                      <h2 className="text-xl font-semibold mb-1">Enter Your Website</h2>
                      <p className="text-muted-foreground text-sm">We&apos;ll analyze it and show you exactly where you&apos;re leaving customers on the table.</p>
                    </div>
                    <form onSubmit={handleUrlSubmit} className="space-y-4">
                      <div className="relative">
                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                          type="text"
                          placeholder="yourbusiness.com"
                          value={url}
                          onChange={(e) => setUrl(e.target.value)}
                          className="pl-10 h-12 text-base"
                        />
                      </div>
                      <Button type="submit" size="lg" className="w-full h-12">
                        <Zap className="mr-2 h-4 w-4" />
                        Analyze My Website
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </form>
                    <p className="text-xs text-muted-foreground text-center mt-4">Free • No credit card • Results in under 60 seconds</p>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* STEP 2 — Email Gate */}
            {step === 2 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="border-border shadow-lg">
                  <CardContent className="p-6 sm:p-10">
                    {!isAnalyzing ? (
                      <>
                        <div className="text-center mb-6">
                          <Mail className="h-12 w-12 text-primary mx-auto mb-3" />
                          <h2 className="text-xl font-semibold mb-1">Almost There!</h2>
                          <p className="text-muted-foreground text-sm">
                            Tell us where to send your free report so you can reference it later.
                          </p>
                        </div>
                        <form onSubmit={handleEmailGate} className="space-y-4">
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <Input
                              type="text"
                              placeholder="Your full name"
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              className="pl-10 h-12 text-base"
                              required
                            />
                          </div>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <Input
                              type="email"
                              placeholder="you@yourbusiness.com"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="pl-10 h-12 text-base"
                              required
                            />
                          </div>
                          <Select value={businessType} onValueChange={setBusinessType}>
                            <SelectTrigger className="h-12">
                              <Building2 className="h-5 w-5 text-muted-foreground mr-2" />
                              <SelectValue placeholder="What type of business?" />
                            </SelectTrigger>
                            <SelectContent>
                              {BUSINESS_TYPES.map((bt) => (
                                <SelectItem key={bt} value={bt}>{bt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button type="submit" size="lg" className="w-full h-12">
                            Generate My Free Report
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        </form>
                        <p className="text-xs text-muted-foreground text-center mt-4">
                          We&apos;ll email you a copy. No spam, just your report.
                        </p>
                      </>
                    ) : (
                      <div className="text-center py-12">
                        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
                        <h2 className="text-xl font-semibold mb-2">Generating Your Report...</h2>
                        <p className="text-muted-foreground">Our AI is analyzing {validatedUrl}. This usually takes 30-60 seconds.</p>
                        <div className="mt-6 flex flex-col gap-2 text-sm text-muted-foreground max-w-xs mx-auto">
                          <div className="flex items-center gap-2"><Search className="h-4 w-4 text-primary" /> Checking how easy you are to find on Google...</div>
                          <div className="flex items-center gap-2"><MousePointer className="h-4 w-4 text-primary" /> Looking at how well your site turns visitors into customers...</div>
                          <div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-primary" /> Testing how fast and smooth your website runs...</div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* STEP 3 — Report */}
            {step === 3 && result && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 max-w-4xl mx-auto">
                {/* Download + Tier Badge */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium ${getTierColor(getTier(result.overallScore))}`}>
                    Recommended: {getTierLabel(getTier(result.overallScore))} Tier
                  </div>
                  <Button onClick={downloadPDF} disabled={isDownloading} variant="outline" className="gap-2">
                    {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Download PDF
                  </Button>
                </div>

                {/* Report -- same component tree the full 11-step form's report
                    uses, so a quick scan and a deep-dive form never show a
                    differently-shaped report for what's conceptually the same thing. */}
                {reportViewData && (
                  <div className="rounded-2xl border border-border overflow-hidden text-left">
                    <ReportView data={reportViewData} />
                  </div>
                )}

                {/* CTA */}
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="p-8 text-center">
                    <h3 className="text-xl font-semibold mb-2">Want us to fix all of this for you?</h3>
                    <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                      Orange Door handles your entire marketing — SEO, content, social media, email campaigns, and monthly reports. You don&apos;t need to lift a finger.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <Button size="lg" onClick={() => handleConvert("call")}>
                        <Calendar className="mr-2 h-4 w-4" />
                        Book a Free Strategy Call
                      </Button>
                      <Button size="lg" variant="outline" onClick={() => handleConvert("signup")}>
                        Sign Up Now
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default QuickAnalysis;
