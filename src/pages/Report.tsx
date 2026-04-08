import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  Loader2, 
  TrendingUp, 
  AlertTriangle, 
  Lightbulb, 
  FileText,
  ArrowRight,
  Share2,
  Check,
  Home,
  Download
} from "lucide-react";
import { generateGapReportPDF } from "@/lib/generateGapReportPDF";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { calculateSystemScorecard, type SystemScorecard } from "@/lib/systemScorecard";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { PlainEnglishSummary } from "@/components/PlainEnglishSummary";
import { addJargonExplanations } from "@/lib/jargonHelper";

interface PlainEnglishSummaryData {
  headline?: string;
  what_this_means?: string;
  top_priority?: string;
  biggest_opportunity?: string;
  what_is_working?: string;
}

interface AIAnalysis {
  executiveSummary: string;
  strengths: string[];
  gaps: string[];
  recommendations: { title: string; description: string; priority: string }[];
  plain_english_summary?: PlainEnglishSummaryData;
}

interface ReportData {
  id: string;
  business_name: string;
  first_name: string;
  last_name: string;
  completed_at: string;
  ai_analysis: AIAnalysis | null;
  // Scorecard fields
  investing_in_seo: boolean | null;
  ranking_for_keywords: boolean | null;
  knows_organic_traffic: boolean | null;
  tracking_keyword_rankings: boolean | null;
  monthly_organic_traffic: number | null;
  tracks_website_conversions: boolean | null;
  monthly_website_leads: number | null;
  website_last_updated: string | null;
  priority_improvement: string | null;
  uses_email_automation: boolean | null;
  uses_sms_followups: boolean | null;
  has_crm: boolean | null;
  crm_tracks_all_inbound: boolean | null;
  has_segmentation_drip: boolean | null;
  has_abandoned_followups: boolean | null;
  uses_online_scheduling: boolean | null;
  lead_response_time: string | null;
  close_rate: string | null;
  common_objections: string | null;
  asks_for_reviews: boolean | null;
  monthly_new_reviews: number | null;
  has_reputation_tool: boolean | null;
  emails_past_customers: boolean | null;
  has_loyalty_referral_program: boolean | null;
  has_post_purchase_followup: boolean | null;
  uses_google_analytics: boolean | null;
  knows_best_lead_sources: boolean | null;
  kpis_tracked: string | null;
  data_accuracy_confidence: string | null;
  does_ab_testing: boolean | null;
  analytics_review_frequency: string | null;
}

export default function Report() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [report, setReport] = useState<ReportData | null>(null);
  const [scorecard, setScorecard] = useState<SystemScorecard | null>(null);
  const [copied, setCopied] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (id) {
      fetchReport();
    }
  }, [id]);

  const fetchReport = async () => {
    try {
      const { data, error } = await supabase
        .from("gap_analysis_submissions")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setNotFound(true);
        return;
      }

      // Parse ai_analysis from JSON
      const reportData: ReportData = {
        ...data,
        ai_analysis: data.ai_analysis as unknown as AIAnalysis | null,
      };

      setReport(reportData);

      // Calculate scorecard
      const calculated = calculateSystemScorecard(data);
      setScorecard(calculated);
    } catch (err) {
      console.error("Failed to fetch report:", err);
      setNotFound(true);
    } finally {
      setIsLoading(false);
    }
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    toast({
      title: "Link copied!",
      description: "Share this link with your team.",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadPDF = () => {
    if (!report) return;
    generateGapReportPDF({
      businessName: report.business_name,
      firstName: report.first_name,
      overallScore: scorecard?.overallScore ?? 0,
      overallStatus: scorecard?.overallStatus,
      scores: scorecard?.scores,
      plainEnglishSummary: aiAnalysis?.executiveSummary,
      executiveSummary: aiAnalysis?.executiveSummary,
      strengths: aiAnalysis?.strengths,
      gaps: aiAnalysis?.gaps,
      recommendations: aiAnalysis?.recommendations,
    });
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return "bg-emerald-500";
    if (score >= 50) return "bg-yellow-500";
    if (score >= 30) return "bg-orange-500";
    return "bg-red-500";
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "strong": return "Strong";
      case "moderate": return "Moderate";
      case "weak": return "Weak";
      case "critical": return "Critical";
      default: return status;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="animate-spin mx-auto mb-4 text-primary" size={40} />
          <p className="text-muted-foreground">Loading your report...</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-20 text-center">
          <h1 className="text-3xl font-display font-semibold text-foreground mb-4">
            Report Not Found
          </h1>
          <p className="text-muted-foreground mb-8">
            This report doesn't exist or may have expired.
          </p>
          <Link to="/">
            <Button className="gap-2">
              <Home size={16} />
              Return Home
            </Button>
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const aiAnalysis = report?.ai_analysis;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="mb-4">
          <BackButton />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground mb-1">
                SYSTEM Gap Report
              </h1>
              <p className="text-muted-foreground">
                Prepared for <span className="text-foreground font-medium">{report?.business_name}</span>
              </p>
              {report?.completed_at && (
                <p className="text-sm text-muted-foreground mt-1">
                  Generated {new Date(report.completed_at).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                variant="outline"
                onClick={downloadPDF}
                className="gap-2"
              >
                <Download size={16} />
                Download PDF
              </Button>
              <Button
                variant="outline"
                onClick={copyShareLink}
                className="gap-2"
              >
                {copied ? <Check size={16} /> : <Share2 size={16} />}
                {copied ? "Copied!" : "Share Report"}
              </Button>
            </div>
          </div>

          {/* Plain English Summary — the most important section */}
          <PlainEnglishSummary
            summary={aiAnalysis?.plain_english_summary}
            overallScore={scorecard?.overallScore ?? 0}
          />

          {/* SYSTEM Scorecard */}
          {scorecard && (
            <Card className="border-primary/20">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="text-primary" size={20} />
                  SYSTEM Health Score
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Overall Score */}
                <div className="text-center p-6 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl">
                  <div className="text-6xl font-bold text-primary mb-2">
                    {scorecard.overallScore}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {scorecard.overallStatus}
                  </div>
                </div>

                {/* Individual Scores */}
                <div className="grid gap-4">
                  {scorecard.scores.map((score) => (
                    <div key={score.category} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-foreground">
                          <span className="text-primary font-bold mr-2 text-lg">
                            {score.category.replace('S2', 'S')}
                          </span>
                          {score.label}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold">{score.score}</span>
                          <Badge 
                            variant="outline" 
                            className={`${
                              score.status === 'strong' ? 'border-emerald-500 text-emerald-600' : 
                              score.status === 'moderate' ? 'border-yellow-500 text-yellow-600' : 
                              score.status === 'weak' ? 'border-orange-500 text-orange-600' : 
                              'border-red-500 text-red-600'
                            }`}
                          >
                            {getStatusLabel(score.status)}
                          </Badge>
                        </div>
                      </div>
                      <div className="h-3 bg-secondary rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full ${getScoreColor(score.score)}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${score.score}%` }}
                          transition={{ duration: 0.6, delay: 0.1 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* AI Analysis */}
          {aiAnalysis && (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Lightbulb className="text-primary" size={20} />
                  AI-Powered Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Executive Summary */}
                {aiAnalysis.executiveSummary && (
                  <div>
                    <h4 className="font-semibold text-foreground mb-3">Executive Summary</h4>
                    <p className="text-muted-foreground leading-relaxed">
                      {aiAnalysis.executiveSummary}
                    </p>
                  </div>
                )}

                {/* Strengths */}
                {aiAnalysis.strengths?.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                      <TrendingUp size={18} className="text-emerald-500" />
                      Key Strengths
                    </h4>
                    <ul className="space-y-2">
                      {aiAnalysis.strengths.map((strength, idx) => (
                        <li key={idx} className="text-muted-foreground flex items-start gap-2">
                          <span className="text-emerald-500 mt-1 shrink-0">✓</span>
                          {strength}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Gaps */}
                {aiAnalysis.gaps?.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                      <AlertTriangle size={18} className="text-orange-500" />
                      Critical Gaps
                    </h4>
                    <ul className="space-y-2">
                      {aiAnalysis.gaps.map((gap, idx) => (
                        <li key={idx} className="text-muted-foreground flex items-start gap-2">
                          <span className="text-orange-500 mt-1 shrink-0">!</span>
                          {gap}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommendations */}
                {aiAnalysis.recommendations?.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                      <Lightbulb size={18} className="text-primary" />
                      Top Recommendations
                    </h4>
                    <div className="space-y-4">
                      {aiAnalysis.recommendations.map((rec, idx) => (
                        <div key={idx} className="bg-secondary/50 rounded-xl p-4">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <h5 className="font-medium text-foreground">{rec.title}</h5>
                            <Badge className="shrink-0 bg-primary/10 text-primary border-0">
                              {rec.priority}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{rec.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* CTA */}
          <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <CardContent className="pt-6 text-center">
              <h3 className="text-xl font-semibold text-foreground mb-3">
                Ready to Close These Gaps?
              </h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Let's discuss your report and build a custom action plan to grow your business.
              </p>
              <Link to="/contact">
                <Button size="lg" className="bg-primary hover:bg-orange-dark text-primary-foreground gap-2">
                  Schedule Your Strategy Call
                  <ArrowRight size={18} />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Footer Link */}
          <div className="text-center pt-4">
            <Link to="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              ← Return to Orange Door Consultants
            </Link>
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
