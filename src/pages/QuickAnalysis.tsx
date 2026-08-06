import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { motion } from "framer-motion";
import { Globe, Zap, Search, MousePointer, Gauge, Loader2, CheckCircle, AlertTriangle, XCircle, Download, Sparkles, Calendar, Rocket, Target, Mail, User, Building2, ArrowRight } from "lucide-react";
import { generateGapReportPDF } from "@/lib/generateGapReportPDF";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    if (score >= 40) return "text-orange-500";
    return "text-red-600";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-green-100";
    if (score >= 60) return "bg-yellow-100";
    if (score >= 40) return "bg-orange-100";
    return "bg-red-100";
  };

  const getScoreIcon = (score: number) => {
    if (score >= 80) return <CheckCircle className="h-5 w-5 text-green-600" />;
    if (score >= 60) return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
    return <XCircle className="h-5 w-5 text-red-600" />;
  };

  const downloadPDF = () => {
    if (!result) return;
    generateGapReportPDF({
      businessName: name || url,
      websiteUrl: validatedUrl,
      overallScore: result.overallScore,
      plainEnglishSummary: result.summary,
      scores: [
        { category: "S", label: "SEO & Visibility", score: result.seo.score, status: result.seo.score >= 70 ? "strong" : result.seo.score >= 50 ? "moderate" : result.seo.score >= 30 ? "weak" : "critical" },
        { category: "Y", label: "Conversion Elements", score: result.conversion.score, status: result.conversion.score >= 70 ? "strong" : result.conversion.score >= 50 ? "moderate" : result.conversion.score >= 30 ? "weak" : "critical" },
        { category: "T", label: "Technical Performance", score: result.technical.score, status: result.technical.score >= 70 ? "strong" : result.technical.score >= 50 ? "moderate" : result.technical.score >= 30 ? "weak" : "critical" },
      ],
      strengths: (result.detectedStrengths?.length ? result.detectedStrengths : result.seo.findings).slice(0, 2),
      gaps: (result.detectedGaps?.length
        ? result.detectedGaps
        : [...result.seo.recommendations.slice(0, 1), ...result.conversion.recommendations.slice(0, 1), ...result.technical.recommendations.slice(0, 1)]
      ).slice(0, 3),
      recommendations: [
        ...result.quickWins?.map(w => ({ title: w.title, description: w.description, priority: "Quick Win" })) || [],
        ...result.seo.recommendations.map(r => ({ title: r, description: "", priority: "Medium Term" })),
        ...result.conversion.recommendations.map(r => ({ title: r, description: "", priority: "Medium Term" })),
        ...result.technical.recommendations.map(r => ({ title: r, description: "", priority: "Medium Term" })),
      ],
    });
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
                  <Button onClick={downloadPDF} variant="outline" className="gap-2">
                    <Download className="h-4 w-4" />
                    Download PDF
                  </Button>
                </div>

                {/* Overall Score */}
                <Card>
                  <CardContent className="p-6 text-center">
                    <h2 className="text-xl font-semibold mb-4">Your Website Marketing Score</h2>
                    <div className={`inline-flex items-center justify-center w-32 h-32 rounded-full ${getScoreBg(result.overallScore)}`}>
                      <span className={`text-5xl font-bold ${getScoreColor(result.overallScore)}`}>
                        {result.overallScore}
                      </span>
                    </div>
                    <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">{result.summary}</p>
                  </CardContent>
                </Card>

                {/* Top 3 Weaknesses */}
                <Card className="border-red-200 bg-red-50/50">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-red-500" />
                      Your Top 3 Areas to Improve
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {[
                        ...result.seo.recommendations.slice(0, 1),
                        ...result.conversion.recommendations.slice(0, 1),
                        ...result.technical.recommendations.slice(0, 1),
                      ].slice(0, 3).map((w, i) => (
                        <div key={i} className="flex items-start gap-3 bg-background rounded-lg p-4 border border-border">
                          <span className="flex-shrink-0 h-6 w-6 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                          <p className="text-sm text-foreground">{w}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Quick Wins */}
                {result.quickWins && result.quickWins.length > 0 && (
                  <Card className="border-primary/20 bg-primary/5">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Sparkles className="h-5 w-5 text-primary" />
                        Quick Wins — Do This Week
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid sm:grid-cols-3 gap-4">
                        {result.quickWins.map((win, i) => (
                          <div key={i} className="bg-background rounded-lg p-4 border border-border">
                            <div className="flex items-start justify-between mb-2">
                              <h4 className="font-semibold text-sm">{win.title}</h4>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                win.impact === "high" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                              }`}>
                                {win.impact} impact
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">{win.description}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Category Scores */}
                <div className="grid md:grid-cols-3 gap-6">
                  {[
                    { key: "seo", label: "SEO & Visibility", desc: "How easy you are to find on Google", icon: <Search className="h-5 w-5 text-primary" />, data: result.seo },
                    { key: "conversion", label: "Conversion", desc: "How well your site turns visitors into customers", icon: <MousePointer className="h-5 w-5 text-primary" />, data: result.conversion },
                    { key: "technical", label: "Technical", desc: "How fast and smooth your website runs", icon: <Gauge className="h-5 w-5 text-primary" />, data: result.technical },
                  ].map((cat) => (
                    <Card key={cat.key}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg flex items-center gap-2">{cat.icon}{cat.label}</CardTitle>
                          {getScoreIcon(cat.data.score)}
                        </div>
                        <p className="text-xs text-muted-foreground">{cat.desc}</p>
                        <div className={`text-3xl font-bold ${getScoreColor(cat.data.score)}`}>{cat.data.score}/100</div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <h4 className="font-medium text-sm mb-2">What We Found</h4>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            {cat.data.findings.map((f, i) => (
                              <li key={i} className="flex items-start gap-2"><span className="text-primary mt-1">•</span>{f}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h4 className="font-medium text-sm mb-2">What to Do</h4>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            {cat.data.recommendations.map((r, i) => (
                              <li key={i} className="flex items-start gap-2"><span className="text-green-600 mt-1">→</span>{r}</li>
                            ))}
                          </ul>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* 90-Day Action Plan */}
                {result.actionPlan && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Rocket className="h-5 w-5 text-primary" />
                        Your 90-Day Action Plan
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid md:grid-cols-3 gap-6">
                        {[
                          { num: 1, label: "Week 1", data: result.actionPlan.week1, color: "green" },
                          { num: 2, label: "Weeks 2-4", data: result.actionPlan.week2to4, color: "yellow" },
                          { num: 3, label: "Months 2-3", data: result.actionPlan.month2to3, color: "primary" },
                        ].map((phase) => (
                          <div key={phase.num} className="space-y-3">
                            <div className="flex items-center gap-2">
                              <div className={`h-8 w-8 rounded-full bg-${phase.color === "primary" ? "primary/10" : `${phase.color}-100`} text-${phase.color === "primary" ? "primary" : `${phase.color}-700`} flex items-center justify-center text-sm font-bold`}>{phase.num}</div>
                              <div>
                                <h4 className="font-semibold text-sm">{phase.label}</h4>
                                <p className="text-xs text-muted-foreground">{phase.data.title}</p>
                              </div>
                            </div>
                            <ul className="space-y-2 pl-10">
                              {phase.data.tasks.map((task, i) => (
                                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                  <span className={`text-${phase.color === "primary" ? "primary" : `${phase.color}-600`}`}>✓</span>{task}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
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
