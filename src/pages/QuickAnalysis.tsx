import { useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { motion } from "framer-motion";
import { Globe, Zap, Search, MousePointer, Gauge, Loader2, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  summary: string;
}

const QuickAnalysis = () => {
  const [url, setUrl] = useState("");
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
        body: { url: validUrl },
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
                Instant Website Analysis
              </span>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-semibold text-foreground mb-4">
                Quick Website Health Check
              </h1>
              <p className="text-muted-foreground text-lg mb-8">
                Enter your website URL and get an instant AI-powered analysis of your SEO, conversion elements, and technical performance.
              </p>

              <div className="flex flex-wrap justify-center gap-6 mb-12">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Search size={18} className="text-primary" />
                  <span>SEO Analysis</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MousePointer size={18} className="text-primary" />
                  <span>Conversion Review</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Gauge size={18} className="text-primary" />
                  <span>Technical Audit</span>
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
                    <Button
                      type="submit"
                      size="lg"
                      className="h-12 px-8"
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
                        Scanning your website... This may take 30-60 seconds.
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

                    {/* CTA */}
                    <div className="text-center pt-6 border-t">
                      <h3 className="text-lg font-semibold mb-2">Want a deeper analysis?</h3>
                      <p className="text-muted-foreground mb-4">
                        Complete our full Gap Analysis for a comprehensive SYSTEM scorecard and personalized recommendations.
                      </p>
                      <Button asChild size="lg">
                        <a href="/gap-analysis">Get Full Gap Analysis</a>
                      </Button>
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
