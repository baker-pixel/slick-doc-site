import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle,
  Loader2,
  ArrowRight,
  AlertTriangle,
  Download,
  Mail,
  Check,
  Link as LinkIcon,
  LayoutDashboard
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { calculateSystemScorecard, type SystemScorecard } from "@/lib/systemScorecard";
import { generateGapReportPDF } from "@/lib/generateGapReportPDF";
import { scoreToStatus, mapPriority, type ReportData } from "@/components/report/ReportConfig";
import { ReportView } from "@/components/report/ReportView";
import type { GapAnalysisData } from "../GapAnalysisForm";

interface AIAnalysis {
  executiveSummary: string;
  strengths: string[];
  gaps: string[];
  recommendations: { title: string; description: string; priority: string }[];
}

interface ReportStepProps {
  formData: GapAnalysisData;
  submissionId: string | null;
  resumeToken?: string | null;
}

export function ReportStep({ formData, submissionId, resumeToken }: ReportStepProps) {
  const { toast } = useToast();
  const [scorecard, setScorecard] = useState<SystemScorecard | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [aiReadinessScore, setAiReadinessScore] = useState<number | undefined>(undefined);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(true);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareableUrl = submissionId ? `${window.location.origin}/report/${submissionId}` : null;

  useEffect(() => {
    // Calculate scorecard immediately
    const scorecardData = {
      investing_in_seo: formData.investingInSeo,
      ranking_for_keywords: formData.rankingForKeywords,
      knows_organic_traffic: formData.knowsOrganicTraffic,
      tracking_keyword_rankings: formData.trackingKeywordRankings,
      monthly_organic_traffic: formData.monthlyOrganicTraffic,
      tracks_website_conversions: formData.tracksWebsiteConversions,
      monthly_website_leads: formData.monthlyWebsiteLeads,
      website_last_updated: formData.websiteLastUpdated,
      priority_improvement: formData.priorityImprovement,
      uses_email_automation: formData.usesEmailAutomation,
      uses_sms_followups: formData.usesSmsFollowups,
      has_crm: formData.hasCrm,
      crm_tracks_all_inbound: formData.crmTracksAllInbound,
      has_segmentation_drip: formData.hasSegmentationDrip,
      has_abandoned_followups: formData.hasAbandonedFollowups,
      uses_online_scheduling: formData.usesOnlineScheduling,
      lead_response_time: formData.leadResponseTime,
      close_rate: formData.closeRate,
      common_objections: formData.commonObjections,
      asks_for_reviews: formData.asksForReviews,
      monthly_new_reviews: formData.monthlyNewReviews,
      has_reputation_tool: formData.hasReputationTool,
      emails_past_customers: formData.emailsPastCustomers,
      has_loyalty_referral_program: formData.hasLoyaltyReferralProgram,
      has_post_purchase_followup: formData.hasPostPurchaseFollowup,
      uses_google_analytics: formData.usesGoogleAnalytics,
      knows_best_lead_sources: formData.knowsBestLeadSources,
      kpis_tracked: formData.kpisTracked,
      data_accuracy_confidence: formData.dataAccuracyConfidence,
      does_ab_testing: formData.doesAbTesting,
      analytics_review_frequency: formData.analyticsReviewFrequency,
    };
    
    const calculated = calculateSystemScorecard(scorecardData);
    setScorecard(calculated);

    // Poll the database for server-side AI analysis
    if (!submissionId) {
      setIsLoadingAnalysis(false);
      setAnalysisError("No submission ID found. Please try again.");
      return;
    }

    let cancelled = false;
    const startTime = Date.now();
    const TIMEOUT_MS = 60_000;
    const POLL_INTERVAL_MS = 3_000;

    const poll = async () => {
      while (!cancelled) {
        if (Date.now() - startTime > TIMEOUT_MS) {
          setAnalysisError("Analysis is taking longer than expected. Please refresh the page in a few minutes.");
          setIsLoadingAnalysis(false);
          return;
        }

        try {
          const { data: row } = await supabase
            .from("gap_analysis_submissions")
            .select("ai_analysis")
            .eq("id", submissionId)
            .single();

          if (row?.ai_analysis) {
            setAiAnalysis(row.ai_analysis as unknown as AIAnalysis);
            setIsLoadingAnalysis(false);
            setEmailSent(true); // Email is sent server-side now

            const { data: readiness } = await supabase
              .from("ai_readiness_scores")
              .select("total_score")
              .eq("submission_id", submissionId)
              .maybeSingle();
            if (readiness) setAiReadinessScore(readiness.total_score);
            return;
          }
        } catch (err) {
          console.error("Polling error:", err);
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    };

    poll();

    return () => {
      cancelled = true;
    };
  }, [submissionId]);

  const copyShareLink = () => {
    if (shareableUrl) {
      navigator.clipboard.writeText(shareableUrl);
      setCopied(true);
      toast({
        title: "Link copied!",
        description: "Share this link with your team to view this report.",
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadPDF = () => {
    if (!scorecard) return;
    generateGapReportPDF({
      businessName: formData.businessName,
      firstName: formData.firstName,
      websiteUrl: formData.websiteUrl,
      overallScore: scorecard.overallScore,
      overallStatus: scorecard.overallStatus,
      scores: scorecard.scores,
      biggestOpportunity: aiAnalysis?.recommendations?.[0]?.title,
      plainEnglishSummary: aiAnalysis?.executiveSummary,
      executiveSummary: aiAnalysis?.executiveSummary,
      strengths: aiAnalysis?.strengths,
      gaps: aiAnalysis?.gaps,
      recommendations: aiAnalysis?.recommendations,
    });
  };

  const reportViewData: ReportData | null = scorecard
    ? {
        businessName: formData.businessName,
        clientDomain: formData.websiteUrl
          ? formData.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")
          : formData.businessName,
        reportDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
        overallScore: scorecard.overallScore,
        aiReadinessScore,
        executiveSummary: aiAnalysis?.executiveSummary,
        biggestOpportunity: aiAnalysis?.recommendations?.[0]?.title,
        categoryScores: scorecard.scores.map((s) => ({
          label: s.label,
          score: s.score,
          status: scoreToStatus(s.score),
        })),
        strengths: aiAnalysis?.strengths || [],
        gaps: aiAnalysis?.gaps || [],
        actions: (aiAnalysis?.recommendations || []).map((rec, i) => ({
          title: rec.title,
          description: rec.description,
          tag: mapPriority(rec.priority, i),
        })),
      }
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* Success Header */}
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="text-emerald-600" size={32} />
        </div>
        <h2 className="text-2xl font-display font-semibold text-foreground mb-2">
          Your SYSTEM Gap Report
        </h2>
        <p className="text-muted-foreground">
          Thank you, <span className="font-medium text-foreground">{formData.firstName}</span>! 
          Here&apos;s your instant analysis for <span className="font-medium text-foreground">{formData.businessName}</span>.
        </p>
        <div className="flex flex-col items-center gap-2 mt-3">
          {emailSent && (
            <p className="text-sm text-primary flex items-center gap-1">
              <Mail size={14} />
              A detailed report has been sent to {formData.email}
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            {resumeToken && (
              <Link to={`/dashboard/${resumeToken}`}>
                <Button
                  variant="default"
                  size="sm"
                  className="gap-2 bg-primary hover:bg-orange-dark"
                >
                  <LayoutDashboard size={14} />
                  View Your Dashboard
                </Button>
              </Link>
            )}
            {shareableUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={copyShareLink}
                className="gap-2"
              >
                {copied ? <Check size={14} /> : <LinkIcon size={14} />}
                {copied ? "Link Copied!" : "Copy Shareable Link"}
              </Button>
            )}
            {reportViewData && (
              <Button variant="outline" size="sm" onClick={downloadPDF} className="gap-2">
                <Download size={14} />
                Download PDF
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Report -- same component tree the shareable /report/:id page renders,
          so this inline view and that page can never show different things. */}
      {reportViewData && (
        <div className="rounded-2xl border border-border overflow-hidden">
          <ReportView data={reportViewData} />
        </div>
      )}

      {isLoadingAnalysis && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="animate-spin mb-3" size={32} />
          <p>Generating your personalized AI analysis...</p>
        </div>
      )}
      {analysisError && (
        <div className="text-center py-6 text-muted-foreground">
          <AlertTriangle className="mx-auto mb-3 text-yellow-500" size={32} />
          <p>{analysisError}</p>
        </div>
      )}

      {/* Next Steps */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <h4 className="font-semibold text-foreground mb-3">What&apos;s Next?</h4>
          <ul className="text-sm text-muted-foreground space-y-2 mb-4">
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">1.</span>
              Review your scorecard and identify priority areas
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">2.</span>
              Our team will reach out to schedule a strategy call
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">3.</span>
              We&apos;ll build a custom action plan for your business
            </li>
          </ul>
          <Link to="/contact">
            <Button className="w-full bg-primary hover:bg-orange-dark text-primary-foreground gap-2">
              Schedule Your Strategy Call
              <ArrowRight size={16} />
            </Button>
          </Link>
        </CardContent>
      </Card>

      <div className="text-center">
        <Link to="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">
          Return to Homepage
        </Link>
      </div>
    </motion.div>
  );
}
