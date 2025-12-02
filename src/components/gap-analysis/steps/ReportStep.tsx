import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  CheckCircle, 
  Loader2, 
  ArrowRight, 
  TrendingUp, 
  AlertTriangle,
  Lightbulb,
  FileText,
  Mail
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { calculateSystemScorecard, type SystemScorecard } from "@/lib/systemScorecard";
import type { GapAnalysisData } from "../GapAnalysisForm";

interface AIAnalysis {
  executiveSummary: string;
  strengths: string[];
  gaps: string[];
  recommendations: { title: string; description: string; priority: string }[];
}

interface ReportStepProps {
  formData: GapAnalysisData;
}

export function ReportStep({ formData }: ReportStepProps) {
  const [scorecard, setScorecard] = useState<SystemScorecard | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(true);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

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

    // Generate AI analysis
    generateAnalysis();
  }, []);

  const generateAnalysis = async () => {
    try {
      const gapAnalysisPayload = {
        business_name: formData.businessName,
        first_name: formData.firstName,
        last_name: formData.lastName,
        website_url: formData.websiteUrl,
        top_business_goals: formData.topBusinessGoals,
        growth_satisfaction: formData.growthSatisfaction,
        primary_customer_sources: formData.primaryCustomerSources,
        top_competitors: formData.topCompetitors,
        unique_differentiator: formData.uniqueDifferentiator,
        has_seasonality: formData.hasSeasonality,
        seasonality_details: formData.seasonalityDetails,
        avg_customer_lifetime_value: formData.avgCustomerLifetimeValue,
        website_last_updated: formData.websiteLastUpdated,
        tracks_website_conversions: formData.tracksWebsiteConversions,
        monthly_website_leads: formData.monthlyWebsiteLeads,
        priority_improvement: formData.priorityImprovement,
        investing_in_seo: formData.investingInSeo,
        ranking_for_keywords: formData.rankingForKeywords,
        monthly_organic_traffic: formData.monthlyOrganicTraffic,
        tracking_keyword_rankings: formData.trackingKeywordRankings,
        running_paid_ads: formData.runningPaidAds,
        ad_platforms: formData.adPlatforms,
        monthly_ad_spend: formData.monthlyAdSpend,
        cost_per_lead: formData.costPerLead,
        satisfied_with_ad_performance: formData.satisfiedWithAdPerformance,
        runs_retargeting: formData.runsRetargeting,
        ads_use_landing_pages: formData.adsUseLandingPages,
        uses_email_automation: formData.usesEmailAutomation,
        uses_sms_followups: formData.usesSmsFollowups,
        has_crm: formData.hasCrm,
        crm_name: formData.crmName,
        crm_tracks_all_inbound: formData.crmTracksAllInbound,
        has_segmentation_drip: formData.hasSegmentationDrip,
        has_abandoned_followups: formData.hasAbandonedFollowups,
        lead_response_time: formData.leadResponseTime,
        close_rate: formData.closeRate,
        uses_online_scheduling: formData.usesOnlineScheduling,
        common_objections: formData.commonObjections,
        where_prospects_lost: formData.whereProspectsLost,
        asks_for_reviews: formData.asksForReviews,
        monthly_new_reviews: formData.monthlyNewReviews,
        has_reputation_tool: formData.hasReputationTool,
        emails_past_customers: formData.emailsPastCustomers,
        repeat_customer_rate: formData.repeatCustomerRate,
        has_loyalty_referral_program: formData.hasLoyaltyReferralProgram,
        uses_google_analytics: formData.usesGoogleAnalytics,
        knows_best_lead_sources: formData.knowsBestLeadSources,
        kpis_tracked: formData.kpisTracked,
        data_accuracy_confidence: formData.dataAccuracyConfidence,
        does_ab_testing: formData.doesAbTesting,
        who_handles_marketing: formData.whoHandlesMarketing,
        monthly_marketing_budget: formData.monthlyMarketingBudget,
        weekly_team_hours: formData.weeklyTeamHours,
        past_marketing_failures: formData.pastMarketingFailures,
        biggest_marketing_frustration: formData.biggestMarketingFrustration,
        biggest_agency_fear: formData.biggestAgencyFear,
        fastest_impact: formData.fastestImpact,
        what_makes_it_worth_it: formData.whatMakesItWorthIt,
      };

      const { data, error } = await supabase.functions.invoke("generate-analysis", {
        body: { gapAnalysis: gapAnalysisPayload },
      });

      if (error) throw error;
      if (data?.analysis) {
        setAiAnalysis(data.analysis);
        // Send email with report after analysis is complete
        sendReportEmail(data.analysis);
      }
    } catch (err) {
      console.error("Analysis generation failed:", err);
      setAnalysisError("Unable to generate detailed analysis. Our team will review your submission manually.");
    } finally {
      setIsLoadingAnalysis(false);
    }
  };

  const sendReportEmail = async (analysis: AIAnalysis) => {
    try {
      await supabase.functions.invoke("send-gap-report", {
        body: {
          email: formData.email,
          firstName: formData.firstName,
          businessName: formData.businessName,
          scorecard: scorecard,
          analysis,
        },
      });
      setEmailSent(true);
    } catch (err) {
      console.error("Failed to send report email:", err);
    }
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
        {emailSent && (
          <p className="text-sm text-primary mt-2 flex items-center justify-center gap-1">
            <Mail size={14} />
            A detailed report has been sent to {formData.email}
          </p>
        )}
      </div>

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
            <div className="text-center p-4 bg-secondary/50 rounded-lg">
              <div className="text-5xl font-bold text-primary mb-2">
                {scorecard.overallScore}
              </div>
              <div className="text-sm text-muted-foreground">
                {scorecard.overallStatus}
              </div>
            </div>

            {/* Individual Scores */}
            <div className="space-y-3">
              {scorecard.scores.map((score) => (
                <div key={score.category} className="space-y-1">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium">
                      <span className="text-primary font-bold mr-2">{score.category.replace('S2', 'S')}</span>
                      {score.label}
                    </span>
                    <Badge variant="outline" className={`${score.status === 'strong' ? 'border-emerald-500 text-emerald-600' : score.status === 'moderate' ? 'border-yellow-500 text-yellow-600' : score.status === 'weak' ? 'border-orange-500 text-orange-600' : 'border-red-500 text-red-600'}`}>
                      {getStatusLabel(score.status)}
                    </Badge>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full ${getScoreColor(score.score)}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${score.score}%` }}
                      transition={{ duration: 0.5, delay: 0.2 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Analysis */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lightbulb className="text-primary" size={20} />
            AI-Powered Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingAnalysis ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="animate-spin mb-3" size={32} />
              <p>Generating your personalized analysis...</p>
            </div>
          ) : analysisError ? (
            <div className="text-center py-6 text-muted-foreground">
              <AlertTriangle className="mx-auto mb-3 text-yellow-500" size={32} />
              <p>{analysisError}</p>
            </div>
          ) : aiAnalysis ? (
            <div className="space-y-6">
              {/* Executive Summary */}
              <div>
                <h4 className="font-semibold text-foreground mb-2">Executive Summary</h4>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {aiAnalysis.executiveSummary}
                </p>
              </div>

              {/* Strengths */}
              {aiAnalysis.strengths?.length > 0 && (
                <div>
                  <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                    <TrendingUp size={16} className="text-emerald-500" />
                    Key Strengths
                  </h4>
                  <ul className="space-y-1">
                    {aiAnalysis.strengths.map((strength, idx) => (
                      <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-emerald-500 mt-1">•</span>
                        {strength}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Gaps */}
              {aiAnalysis.gaps?.length > 0 && (
                <div>
                  <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                    <AlertTriangle size={16} className="text-orange-500" />
                    Critical Gaps
                  </h4>
                  <ul className="space-y-1">
                    {aiAnalysis.gaps.map((gap, idx) => (
                      <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-orange-500 mt-1">•</span>
                        {gap}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommendations */}
              {aiAnalysis.recommendations?.length > 0 && (
                <div>
                  <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Lightbulb size={16} className="text-primary" />
                    Top Recommendations
                  </h4>
                  <div className="space-y-3">
                    {aiAnalysis.recommendations.map((rec, idx) => (
                      <div key={idx} className="bg-secondary/50 rounded-lg p-3">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h5 className="font-medium text-foreground text-sm">{rec.title}</h5>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {rec.priority}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{rec.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

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
