import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, Home, Download, Share2, Check } from "lucide-react";
import { generateGapReportPDF } from "@/lib/generateGapReportPDF";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { calculateSystemScorecard, type SystemScorecard } from "@/lib/systemScorecard";
import { scoreToStatus, mapPriority, type ReportData } from "@/components/report/ReportConfig";
import { ReportView } from "@/components/report/ReportView";

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

interface SubmissionRow {
  id: string;
  business_name: string;
  website_url: string | null;
  first_name: string;
  last_name: string;
  completed_at: string;
  ai_analysis: AIAnalysis | null;
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
  const [report, setReport] = useState<SubmissionRow | null>(null);
  const [scorecard, setScorecard] = useState<SystemScorecard | null>(null);
  const [aiReadinessScore, setAiReadinessScore] = useState<number | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (id) fetchReport();
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

      const reportData: SubmissionRow = {
        ...data,
        ai_analysis: data.ai_analysis as unknown as AIAnalysis | null,
      };
      setReport(reportData);
      setScorecard(calculateSystemScorecard(data));

      const { data: readiness } = await supabase
        .from("ai_readiness_scores")
        .select("total_score")
        .eq("submission_id", id)
        .maybeSingle();
      if (readiness) setAiReadinessScore(readiness.total_score);
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
    toast({ title: "Link copied!", description: "Share this link with your team." });
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadPDF = () => {
    if (!report || !scorecard) return;
    const aiAnalysis = report.ai_analysis;
    generateGapReportPDF({
      businessName: report.business_name,
      firstName: report.first_name,
      overallScore: scorecard.overallScore,
      overallStatus: scorecard.overallStatus,
      scores: scorecard.scores,
      biggestOpportunity: aiAnalysis?.plain_english_summary?.biggest_opportunity,
      plainEnglishSummary: aiAnalysis?.executiveSummary,
      executiveSummary: aiAnalysis?.executiveSummary,
      strengths: aiAnalysis?.strengths,
      gaps: aiAnalysis?.gaps,
      recommendations: aiAnalysis?.recommendations,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F8FA]">
        <div className="text-center">
          <Loader2 className="animate-spin mx-auto mb-4 text-[#1D9E75]" size={36} />
          <p className="text-[#8A8F9B] text-[13px]">Loading your report…</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center">
        <div className="text-center px-4">
          <h1 className="text-3xl font-semibold text-[#1A1D23] mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>
            Report Not Found
          </h1>
          <p className="text-[#8A8F9B] text-[13px] mb-8">This report doesn't exist or may have expired.</p>
          <Link to="/">
            <Button className="gap-2 bg-[#0F6E56] hover:bg-[#0a4f3e] text-[#E1F5EE]">
              <Home size={16} />
              Return Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const aiAnalysis = report?.ai_analysis;
  const clientDomain = report?.website_url
    ? report.website_url.replace(/^https?:\/\//, "").replace(/\/$/, "")
    : report?.business_name || "";
  const reportDate = report?.completed_at
    ? new Date(report.completed_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  // Build category scores from scorecard
  const categoryScores = scorecard
    ? scorecard.scores.map((s) => ({
        label: s.label,
        score: s.score,
        status: scoreToStatus(s.score),
      }))
    : [];

  // Build action plan from recommendations
  const actions = (aiAnalysis?.recommendations || []).map((rec, i) => ({
    title: rec.title,
    description: rec.description,
    tag: mapPriority(rec.priority, i),
  }));

  const reportViewData: ReportData = {
    businessName: report?.business_name,
    clientDomain,
    reportDate,
    overallScore: scorecard?.overallScore ?? 0,
    aiReadinessScore,
    executiveSummary: aiAnalysis?.executiveSummary,
    biggestOpportunity: aiAnalysis?.plain_english_summary?.biggest_opportunity,
    categoryScores,
    strengths: aiAnalysis?.strengths || [],
    gaps: aiAnalysis?.gaps || [],
    actions,
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Sticky toolbar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-[rgba(0,0,0,0.08)]">
        <div className="max-w-[820px] mx-auto px-10 flex items-center justify-between h-12">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-[#0F6E56] text-[10px] tracking-[0.15em] uppercase font-semibold shrink-0">
              Orange Door
            </span>
            {report?.business_name && (
              <>
                <span className="text-[#8A8F9B] text-xs">·</span>
                <span className="text-[#8A8F9B] text-xs truncate">{report.business_name}</span>
              </>
            )}
          </div>
          <div className="flex gap-3 shrink-0">
            <button
              onClick={downloadPDF}
              disabled={!scorecard}
              className="flex items-center gap-1.5 text-[#8A8F9B] hover:text-[#1A1D23] text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title={!scorecard ? "Report still loading…" : "Download PDF"}
            >
              <Download size={14} />
              PDF
            </button>
            <button
              onClick={copyShareLink}
              className="flex items-center gap-1.5 text-[#8A8F9B] hover:text-[#1A1D23] text-xs transition-colors"
            >
              {copied ? <Check size={14} /> : <Share2 size={14} />}
              {copied ? "Copied" : "Share"}
            </button>
          </div>
        </div>
      </div>

      {/* Report shell */}
      <div className="pt-12 max-w-[820px] mx-auto bg-white shadow-[0_2px_24px_rgba(0,0,0,0.06)]">
        <ReportView data={reportViewData} />

        <div className="bg-[#F7F8FA] py-4 text-center border-t border-[rgba(0,0,0,0.06)]">
          <Link to="/" className="text-[#8A8F9B] hover:text-[#1A1D23] text-xs transition-colors">
            ← Return to orangedoormarketing.com
          </Link>
        </div>
      </div>
    </div>
  );
}
