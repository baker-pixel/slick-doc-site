import { useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { motion } from "framer-motion";
import { Globe, Zap, Search, MousePointer, Gauge, Loader2, CheckCircle, AlertTriangle, XCircle, Download, Sparkles, Calendar, Rocket, Target } from "lucide-react";
import jsPDF from "jspdf";
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
  seo: {
    score: number;
    findings: string[];
    recommendations: string[];
  };
  conversion: {
    score: number;
    findings: string[];
    recommendations: string[];
  };
  technical: {
    score: number;
    findings: string[];
    recommendations: string[];
  };
  quickWins?: QuickWin[];
  actionPlan?: ActionPlan;
  summary: string;
}

const INDUSTRIES = [
  "Home Services (HVAC, Plumbing, Electrical)",
  "Healthcare / Medical",
  "Legal Services",
  "Real Estate",
  "Restaurant / Food Service",
  "Retail / E-commerce",
  "Professional Services",
  "Construction / Contracting",
  "Automotive",
  "Fitness / Wellness",
  "Other",
];

const QuickAnalysis = () => {
  const [url, setUrl] = useState("");
  const [industry, setIndustry] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const { toast } = useToast();

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url) {
      toast({
        title: "URL Required",
        description: "Please enter a website URL to analyze.",
        variant: "destructive",
      });
      return;
    }

    // Validate URL format
    let validUrl = url;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      validUrl = "https://" + url;
    }

    try {
      new URL(validUrl);
    } catch {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid website URL.",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("analyze-website", {
        body: { url: validUrl, industry: industry || undefined },
      });

      if (error) {
        throw error;
      }

      if (data?.analysis) {
        setResult(data.analysis);
        toast({
          title: "Analysis Complete",
          description: "Your website analysis is ready!",
        });
      } else {
        throw new Error("No analysis data returned");
      }
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

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const orange = [243, 118, 41]; // Orange Door brand color
    const navy = [26, 32, 44]; // Dark navy
    const green = [34, 197, 94];
    const yellow = [234, 179, 8];
    const red = [239, 68, 68];
    let yPos = 15;

    // Helper for score color
    const getScoreRGB = (score: number): number[] => {
      if (score >= 80) return green;
      if (score >= 60) return yellow;
      return red;
    };

    // ===== HEADER BANNER =====
    doc.setFillColor(orange[0], orange[1], orange[2]);
    doc.rect(0, 0, pageWidth, 45, "F");
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("Website Health Report", pageWidth / 2, 22, { align: "center" });
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(url, pageWidth / 2, 33, { align: "center" });
    
    yPos = 55;

    // ===== OVERALL SCORE CIRCLE =====
    const scoreColor = getScoreRGB(result.overallScore);
    doc.setFillColor(scoreColor[0], scoreColor[1], scoreColor[2]);
    doc.circle(pageWidth / 2, yPos + 20, 22, "F");
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(28);
    doc.setFont("helvetica", "bold");
    doc.text(String(result.overallScore), pageWidth / 2, yPos + 24, { align: "center" });
    
    doc.setTextColor(navy[0], navy[1], navy[2]);
    doc.setFontSize(12);
    doc.text("Overall Score", pageWidth / 2, yPos + 50, { align: "center" });
    
    yPos += 60;

    // Summary
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    const summaryLines = doc.splitTextToSize(result.summary, pageWidth - 40);
    doc.text(summaryLines, pageWidth / 2, yPos, { align: "center", maxWidth: pageWidth - 40 });
    yPos += summaryLines.length * 5 + 15;

    // ===== QUICK WINS BOX =====
    if (result.quickWins && result.quickWins.length > 0) {
      doc.setFillColor(255, 247, 237); // Light orange bg
      doc.roundedRect(15, yPos - 5, pageWidth - 30, 8 + result.quickWins.length * 22, 4, 4, "F");
      
      doc.setTextColor(orange[0], orange[1], orange[2]);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("⚡ Quick Wins - Do This Week!", 20, yPos + 5);
      yPos += 12;

      doc.setTextColor(navy[0], navy[1], navy[2]);
      result.quickWins.forEach((win, i) => {
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(`${i + 1}. ${win.title}`, 22, yPos + 5);
        
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        const descLines = doc.splitTextToSize(win.description, pageWidth - 50);
        doc.text(descLines, 22, yPos + 11);
        yPos += 20;
        doc.setTextColor(navy[0], navy[1], navy[2]);
      });
      yPos += 10;
    }

    // ===== CATEGORY SCORES =====
    const addSection = (title: string, emoji: string, score: number, findings: string[], recommendations: string[]) => {
      if (yPos > 230) {
        doc.addPage();
        yPos = 20;
      }

      // Section header with colored bar
      const sectionColor = getScoreRGB(score);
      doc.setFillColor(sectionColor[0], sectionColor[1], sectionColor[2]);
      doc.rect(15, yPos, 4, 25, "F");
      
      doc.setTextColor(navy[0], navy[1], navy[2]);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(`${emoji} ${title}`, 24, yPos + 6);
      
      // Score badge
      doc.setFillColor(sectionColor[0], sectionColor[1], sectionColor[2]);
      doc.roundedRect(pageWidth - 45, yPos, 30, 12, 2, 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.text(`${score}/100`, pageWidth - 30, yPos + 8, { align: "center" });
      
      yPos += 15;

      // Findings
      doc.setTextColor(navy[0], navy[1], navy[2]);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("What we found:", 24, yPos);
      yPos += 5;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      findings.forEach((finding) => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        const lines = doc.splitTextToSize(`• ${finding}`, pageWidth - 55);
        doc.text(lines, 28, yPos);
        yPos += lines.length * 4 + 2;
      });

      yPos += 3;
      doc.setTextColor(green[0], green[1], green[2]);
      doc.setFont("helvetica", "bold");
      doc.text("Recommendations:", 24, yPos);
      yPos += 5;

      doc.setFont("helvetica", "normal");
      recommendations.forEach((rec) => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        const lines = doc.splitTextToSize(`✓ ${rec}`, pageWidth - 55);
        doc.text(lines, 28, yPos);
        yPos += lines.length * 4 + 2;
      });

      yPos += 12;
    };

    addSection("SEO & Visibility", "🔍", result.seo.score, result.seo.findings, result.seo.recommendations);
    addSection("Conversion Elements", "🎯", result.conversion.score, result.conversion.findings, result.conversion.recommendations);
    addSection("Technical Performance", "⚙️", result.technical.score, result.technical.findings, result.technical.recommendations);

    // ===== 90-DAY ACTION PLAN =====
    if (result.actionPlan) {
      doc.addPage();
      yPos = 20;

      // Header
      doc.setFillColor(navy[0], navy[1], navy[2]);
      doc.rect(0, 0, pageWidth, 35, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text("🚀 Your 90-Day Action Plan", pageWidth / 2, 23, { align: "center" });
      yPos = 50;

      const phases = [
        { title: "Week 1", subtitle: result.actionPlan.week1.title, tasks: result.actionPlan.week1.tasks, color: green },
        { title: "Weeks 2-4", subtitle: result.actionPlan.week2to4.title, tasks: result.actionPlan.week2to4.tasks, color: yellow },
        { title: "Months 2-3", subtitle: result.actionPlan.month2to3.title, tasks: result.actionPlan.month2to3.tasks, color: orange },
      ];

      phases.forEach((phase, idx) => {
        // Phase badge
        doc.setFillColor(phase.color[0], phase.color[1], phase.color[2]);
        doc.circle(25, yPos + 5, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(String(idx + 1), 25, yPos + 8, { align: "center" });

        doc.setTextColor(navy[0], navy[1], navy[2]);
        doc.setFontSize(14);
        doc.text(phase.title, 38, yPos + 4);
        
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(phase.subtitle, 38, yPos + 12);
        yPos += 20;

        phase.tasks.forEach((task) => {
          doc.setTextColor(phase.color[0], phase.color[1], phase.color[2]);
          doc.text("✓", 40, yPos);
          doc.setTextColor(60, 60, 60);
          const lines = doc.splitTextToSize(task, pageWidth - 60);
          doc.text(lines, 48, yPos);
          yPos += lines.length * 5 + 3;
        });
        yPos += 10;
      });
    }

    // ===== FOOTER ON LAST PAGE =====
    doc.setFillColor(orange[0], orange[1], orange[2]);
    doc.rect(0, 275, pageWidth, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Orange Door Digital Marketing", pageWidth / 2, 284, { align: "center" });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated ${new Date().toLocaleDateString()} • orangedoor.marketing`, pageWidth / 2, 291, { align: "center" });

    doc.save(`website-analysis-${new Date().toISOString().split("T")[0]}.pdf`);
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
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-3xl mx-auto text-center"
            >
              <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
                AI-Powered Analysis
              </span>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-semibold text-foreground mb-4">
                Quick Website Health Check
              </h1>
              <p className="text-muted-foreground text-lg mb-8">
                Get an instant AI analysis with personalized Quick Wins and a 90-day action plan tailored to your industry.
              </p>

              <div className="flex flex-wrap justify-center gap-6 mb-12">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Sparkles size={18} className="text-primary" />
                  <span>Quick Wins</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar size={18} className="text-primary" />
                  <span>90-Day Plan</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Target size={18} className="text-primary" />
                  <span>Industry Insights</span>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Analysis Form */}
        <section className="section-padding pb-24">
          <div className="container-wide mx-auto max-w-4xl">
            <Card className="border-border shadow-lg">
              <CardContent className="p-6 sm:p-10">
                <form onSubmit={handleAnalyze} className="space-y-6">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1 relative">
                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                          type="text"
                          placeholder="Enter your website URL (e.g., example.com)"
                          value={url}
                          onChange={(e) => setUrl(e.target.value)}
                          className="pl-10 h-12 text-base"
                          disabled={isAnalyzing}
                        />
                      </div>
                      <Select value={industry} onValueChange={setIndustry} disabled={isAnalyzing}>
                        <SelectTrigger className="w-full sm:w-[240px] h-12">
                          <SelectValue placeholder="Select industry (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {INDUSTRIES.map((ind) => (
                            <SelectItem key={ind} value={ind}>
                              {ind}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="submit"
                      size="lg"
                      className="h-12 w-full sm:w-auto sm:self-center px-12"
                      disabled={isAnalyzing}
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Zap className="mr-2 h-4 w-4" />
                          Analyze Now
                        </>
                      )}
                    </Button>
                  </div>
                </form>

                {isAnalyzing && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-8 text-center"
                  >
                    <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-primary/5">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span className="text-muted-foreground">
                        AI is analyzing your website... This may take 30-60 seconds.
                      </span>
                    </div>
                  </motion.div>
                )}

                {result && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-10 space-y-8"
                  >
                    {/* Download Button */}
                    <div className="flex justify-center sm:justify-end">
                      <Button onClick={downloadPDF} variant="outline" className="gap-2 w-full sm:w-auto">
                        <Download className="h-4 w-4" />
                        Download PDF
                      </Button>
                    </div>

                    {/* Overall Score */}
                    <div className="text-center">
                      <h2 className="text-xl font-semibold mb-4">Overall Website Score</h2>
                      <div className={`inline-flex items-center justify-center w-32 h-32 rounded-full ${getScoreBg(result.overallScore)}`}>
                        <span className={`text-5xl font-bold ${getScoreColor(result.overallScore)}`}>
                          {result.overallScore}
                        </span>
                      </div>
                      <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
                        {result.summary}
                      </p>
                    </div>

                    {/* Quick Wins */}
                    {result.quickWins && result.quickWins.length > 0 && (
                      <Card className="border-primary/20 bg-primary/5">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-lg">
                            <Sparkles className="h-5 w-5 text-primary" />
                            Quick Wins - Do This Week
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
                      {/* SEO */}
                      <Card>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg flex items-center gap-2">
                              <Search className="h-5 w-5 text-primary" />
                              SEO & Visibility
                            </CardTitle>
                            {getScoreIcon(result.seo.score)}
                          </div>
                          <div className={`text-3xl font-bold ${getScoreColor(result.seo.score)}`}>
                            {result.seo.score}/100
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <h4 className="font-medium text-sm mb-2">Findings</h4>
                            <ul className="text-sm text-muted-foreground space-y-1">
                              {result.seo.findings.map((finding, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="text-primary mt-1">•</span>
                                  {finding}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="font-medium text-sm mb-2">Recommendations</h4>
                            <ul className="text-sm text-muted-foreground space-y-1">
                              {result.seo.recommendations.map((rec, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="text-green-600 mt-1">→</span>
                                  {rec}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Conversion */}
                      <Card>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg flex items-center gap-2">
                              <MousePointer className="h-5 w-5 text-primary" />
                              Conversion Elements
                            </CardTitle>
                            {getScoreIcon(result.conversion.score)}
                          </div>
                          <div className={`text-3xl font-bold ${getScoreColor(result.conversion.score)}`}>
                            {result.conversion.score}/100
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <h4 className="font-medium text-sm mb-2">Findings</h4>
                            <ul className="text-sm text-muted-foreground space-y-1">
                              {result.conversion.findings.map((finding, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="text-primary mt-1">•</span>
                                  {finding}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="font-medium text-sm mb-2">Recommendations</h4>
                            <ul className="text-sm text-muted-foreground space-y-1">
                              {result.conversion.recommendations.map((rec, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="text-green-600 mt-1">→</span>
                                  {rec}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Technical */}
                      <Card>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg flex items-center gap-2">
                              <Gauge className="h-5 w-5 text-primary" />
                              Technical Performance
                            </CardTitle>
                            {getScoreIcon(result.technical.score)}
                          </div>
                          <div className={`text-3xl font-bold ${getScoreColor(result.technical.score)}`}>
                            {result.technical.score}/100
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <h4 className="font-medium text-sm mb-2">Findings</h4>
                            <ul className="text-sm text-muted-foreground space-y-1">
                              {result.technical.findings.map((finding, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="text-primary mt-1">•</span>
                                  {finding}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="font-medium text-sm mb-2">Recommendations</h4>
                            <ul className="text-sm text-muted-foreground space-y-1">
                              {result.technical.recommendations.map((rec, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="text-green-600 mt-1">→</span>
                                  {rec}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </CardContent>
                      </Card>
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
                            {/* Week 1 */}
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-sm font-bold">1</div>
                                <div>
                                  <h4 className="font-semibold text-sm">Week 1</h4>
                                  <p className="text-xs text-muted-foreground">{result.actionPlan.week1.title}</p>
                                </div>
                              </div>
                              <ul className="space-y-2 pl-10">
                                {result.actionPlan.week1.tasks.map((task, i) => (
                                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                    <span className="text-green-600">✓</span>
                                    {task}
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Weeks 2-4 */}
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-full bg-yellow-100 text-yellow-700 flex items-center justify-center text-sm font-bold">2</div>
                                <div>
                                  <h4 className="font-semibold text-sm">Weeks 2-4</h4>
                                  <p className="text-xs text-muted-foreground">{result.actionPlan.week2to4.title}</p>
                                </div>
                              </div>
                              <ul className="space-y-2 pl-10">
                                {result.actionPlan.week2to4.tasks.map((task, i) => (
                                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                    <span className="text-yellow-600">✓</span>
                                    {task}
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Months 2-3 */}
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">3</div>
                                <div>
                                  <h4 className="font-semibold text-sm">Months 2-3</h4>
                                  <p className="text-xs text-muted-foreground">{result.actionPlan.month2to3.title}</p>
                                </div>
                              </div>
                              <ul className="space-y-2 pl-10">
                                {result.actionPlan.month2to3.tasks.map((task, i) => (
                                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                    <span className="text-primary">✓</span>
                                    {task}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* CTA */}
                    <div className="text-center pt-6 border-t">
                      <h3 className="text-lg font-semibold mb-2">Want help executing this plan?</h3>
                      <p className="text-muted-foreground mb-4">
                        Schedule a free strategy call and we'll help you prioritize and implement these improvements.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <Button asChild size="lg">
                          <a href="/schedule">Schedule Strategy Call</a>
                        </Button>
                        <Button asChild variant="outline" size="lg">
                          <a href="/gap-analysis">Get Full Gap Analysis</a>
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default QuickAnalysis;
