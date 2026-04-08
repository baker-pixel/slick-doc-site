import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, Home, Download, Share2, Check } from "lucide-react";
import { generateGapReportPDF } from "@/lib/generateGapReportPDF";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { calculateSystemScorecard, type SystemScorecard } from "@/lib/systemScorecard";
import { scoreToStatus } from "@/components/report/ReportConfig";

import { CoverSection } from "@/components/report/CoverSection";
import { ExecutiveSummarySection } from "@/components/report/ExecutiveSummarySection";
import { CategoryScoresSection } from "@/components/report/CategoryScoresSection";
import { StrengthsGapsSection } from "@/components/report/StrengthsGapsSection";
import { ActionPlanSection } from "@/components/report/ActionPlanSection";
import { FooterCTA } from "@/components/report/FooterCTA";

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
  const [report, setReport] = useState<ReportData | null>(null);
  const [scorecard, setScorecard] = useState<SystemScorecard | null>(null);
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

      const reportData: ReportData = {
        ...data,
        ai_analysis: data.ai_analysis as unknown as AIAnalysis | null,
      };
      setReport(reportData);
      setScorecard(calculateSystemScorecard(data));
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
      plainEnglishSummary: aiAnalysis?.executiveSummary,
      executiveSummary: aiAnalysis?.executiveSummary,
      strengths: aiAnalysis?.strengths,
      gaps: aiAnalysis?.gaps,
      recommendations: aiAnalysis?.recommendations,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1A1410]">
        <div className="text-center">
          <Loader2 className="animate-spin mx-auto mb-4 text-[#E8521A]" size={40} />
          <p className="text-white/50">Loading your report...</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
        <div className="text-center px-4">
          <h1 className="text-3xl font-semibold text-[#1A1410] mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>
            Report Not Found
          </h1>
          <p className="text-[#1A1410]/50 mb-8">This report doesn't exist or may have expired.</p>
          <Link to="/">
            <Button className="gap-2 bg-[#E8521A] hover:bg-[#E8521A]/90 text-white">
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
    tag: (i < 3 ? "Quick Win" : "Medium Term") as "Quick Win" | "Medium Term" | "Long Term",
  }));

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Sticky toolbar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#1A1410]/95 backdrop-blur-sm border-b border-white/5">
        <div className="container mx-auto px-4 max-w-4xl flex items-center justify-between h-12">
          <span className="text-white/30 text-xs tracking-wide">
            Orange Door — Confidential Report
          </span>
          <div className="flex gap-2">
            <button
              onClick={downloadPDF}
              className="flex items-center gap-1.5 text-white/50 hover:text-white text-xs transition-colors"
            >
              <Download size={14} />
              PDF
            </button>
            <button
              onClick={copyShareLink}
              className="flex items-center gap-1.5 text-white/50 hover:text-white text-xs transition-colors"
            >
              {copied ? <Check size={14} /> : <Share2 size={14} />}
              {copied ? "Copied" : "Share"}
            </button>
          </div>
        </div>
      </div>

      {/* Cover */}
      <div className="pt-12">
        <CoverSection
          clientDomain={clientDomain}
          reportDate={reportDate}
          overallScore={scorecard?.overallScore ?? 0}
        />
      </div>

      {/* Executive Summary */}
      {aiAnalysis?.executiveSummary && (
        <ExecutiveSummarySection
          summary={aiAnalysis.executiveSummary}
          biggestOpportunity={aiAnalysis.plain_english_summary?.biggest_opportunity}
        />
      )}

      {/* Category Scores */}
      {categoryScores.length > 0 && (
        <CategoryScoresSection scores={categoryScores} />
      )}

      {/* Strengths & Gaps */}
      {(aiAnalysis?.strengths?.length || aiAnalysis?.gaps?.length) && (
        <StrengthsGapsSection
          strengths={aiAnalysis?.strengths || []}
          gaps={aiAnalysis?.gaps || []}
        />
      )}

      {/* Action Plan */}
      {actions.length > 0 && (
        <ActionPlanSection actions={actions} />
      )}

      {/* Footer CTA */}
      <FooterCTA />

      {/* Bottom link */}
      <div className="bg-[#1A1410] py-4 text-center border-t border-white/5">
        <Link to="/" className="text-white/20 hover:text-white/40 text-xs transition-colors">
          ← Return to orangedoorconsulting.com
        </Link>
      </div>
    </div>
  );
}
