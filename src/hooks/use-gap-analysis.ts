import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { handleEdgeError } from "@/lib/edge-error";
import { calculateSystemScorecard } from "@/lib/systemScorecard";
import type { GapAnalysisData } from "@/components/gap-analysis/GapAnalysisForm";

const initialData: GapAnalysisData = {
  firstName: "",
  lastName: "",
  businessName: "",
  email: "",
  phone: "",
  websiteUrl: "",
  topBusinessGoals: "",
  growthSatisfaction: 50,
  primaryCustomerSources: "",
  topCompetitors: "",
  uniqueDifferentiator: "",
  hasSeasonality: null,
  seasonalityDetails: "",
  avgCustomerLifetimeValue: "",
  revenueNewCustomersPct: 0,
  revenueRepeatCustomersPct: 0,
  revenueReferralsPct: 0,
  socialMediaHandles: "",
  websiteLastUpdated: "",
  tracksWebsiteConversions: null,
  conversionTrackingMethod: "",
  monthlyWebsiteLeads: 0,
  investingInSeo: null,
  rankingForKeywords: null,
  knowsOrganicTraffic: null,
  monthlyOrganicTraffic: 0,
  trackingKeywordRankings: null,
  runningPaidAds: null,
  adPlatforms: "",
  monthlyAdSpend: "",
  costPerLead: "",
  adsMatchCustomerIntent: null,
  adManager: "",
  satisfiedWithAdPerformance: null,
  adPerformanceNotes: "",
  costPerAcquisition: "",
  runsRetargeting: null,
  adsUseLandingPages: null,
  usesEmailAutomation: null,
  usesSmsFollowups: null,
  hasCrm: null,
  crmName: "",
  crmTracksAllInbound: null,
  hasSegmentationDrip: null,
  hasAbandonedFollowups: null,
  leadToCustomerConversionRate: "",
  leadResponseTime: "",
  closeRate: "",
  commonObjections: "",
  whereProspectsLost: "",
  usesOnlineScheduling: null,
  avgTimeToQuote: "",
  asksForReviews: null,
  monthlyNewReviews: 0,
  emailsPastCustomers: null,
  hasReputationTool: null,
  reputationToolName: "",
  repeatCustomerRate: "",
  hasLoyaltyReferralProgram: null,
  hasPostPurchaseFollowup: null,
  usesGoogleAnalytics: null,
  knowsBestLeadSources: null,
  kpisTracked: "",
  dataAccuracyConfidence: "",
  kpiTrackingFrequency: "",
  analyticsReviewFrequency: "",
  doesAbTesting: null,
  whoHandlesMarketing: "",
  monthlyMarketingBudget: "",
  successDefinition3mo: "",
  successDefinition6mo: "",
  successDefinition12mo: "",
  weeklyTeamHours: "",
  pastMarketingFailures: "",
  marketingToOffload: "",
  biggestMarketingFrustration: "",
  sufferingFromWeakDigital: "",
  leastUnderstoodMarketing: "",
  automationWishlist: "",
  biggestAgencyFear: "",
  priorityImprovement: "",
  reasonSeekingHelp: "",
  fastestImpact: "",
  whatMakesItWorthIt: "",
  additionalNotes: "",
};

export function mapFormDataToDb(data: GapAnalysisData) {
  return {
    first_name: data.firstName,
    last_name: data.lastName,
    business_name: data.businessName,
    email: data.email,
    phone: data.phone || null,
    website_url: data.websiteUrl || null,
    top_business_goals: data.topBusinessGoals || null,
    growth_satisfaction: data.growthSatisfaction || null,
    primary_customer_sources: data.primaryCustomerSources || null,
    top_competitors: data.topCompetitors || null,
    unique_differentiator: data.uniqueDifferentiator || null,
    has_seasonality: data.hasSeasonality,
    seasonality_details: data.seasonalityDetails || null,
    avg_customer_lifetime_value: data.avgCustomerLifetimeValue || null,
    revenue_new_customers_pct: data.revenueNewCustomersPct || null,
    revenue_repeat_customers_pct: data.revenueRepeatCustomersPct || null,
    revenue_referrals_pct: data.revenueReferralsPct || null,
    social_media_handles: data.socialMediaHandles || null,
    website_last_updated: data.websiteLastUpdated || null,
    tracks_website_conversions: data.tracksWebsiteConversions,
    conversion_tracking_method: data.conversionTrackingMethod || null,
    monthly_website_leads: data.monthlyWebsiteLeads || null,
    investing_in_seo: data.investingInSeo,
    ranking_for_keywords: data.rankingForKeywords,
    knows_organic_traffic: data.knowsOrganicTraffic,
    monthly_organic_traffic: data.monthlyOrganicTraffic || null,
    tracking_keyword_rankings: data.trackingKeywordRankings,
    running_paid_ads: data.runningPaidAds,
    ad_platforms: data.adPlatforms || null,
    monthly_ad_spend: data.monthlyAdSpend || null,
    cost_per_lead: data.costPerLead || null,
    ads_match_customer_intent: data.adsMatchCustomerIntent,
    ad_manager: data.adManager || null,
    satisfied_with_ad_performance: data.satisfiedWithAdPerformance,
    ad_performance_notes: data.adPerformanceNotes || null,
    cost_per_acquisition: data.costPerAcquisition || null,
    runs_retargeting: data.runsRetargeting,
    ads_use_landing_pages: data.adsUseLandingPages,
    uses_email_automation: data.usesEmailAutomation,
    uses_sms_followups: data.usesSmsFollowups,
    has_crm: data.hasCrm,
    crm_name: data.crmName || null,
    crm_tracks_all_inbound: data.crmTracksAllInbound,
    has_segmentation_drip: data.hasSegmentationDrip,
    has_abandoned_followups: data.hasAbandonedFollowups,
    lead_to_customer_conversion_rate: data.leadToCustomerConversionRate || null,
    lead_response_time: data.leadResponseTime || null,
    close_rate: data.closeRate || null,
    common_objections: data.commonObjections || null,
    where_prospects_lost: data.whereProspectsLost || null,
    uses_online_scheduling: data.usesOnlineScheduling,
    avg_time_to_quote: data.avgTimeToQuote || null,
    asks_for_reviews: data.asksForReviews,
    monthly_new_reviews: data.monthlyNewReviews || null,
    emails_past_customers: data.emailsPastCustomers,
    has_reputation_tool: data.hasReputationTool,
    reputation_tool_name: data.reputationToolName || null,
    repeat_customer_rate: data.repeatCustomerRate || null,
    has_loyalty_referral_program: data.hasLoyaltyReferralProgram,
    has_post_purchase_followup: data.hasPostPurchaseFollowup,
    uses_google_analytics: data.usesGoogleAnalytics,
    knows_best_lead_sources: data.knowsBestLeadSources,
    kpis_tracked: data.kpisTracked || null,
    data_accuracy_confidence: data.dataAccuracyConfidence || null,
    kpi_tracking_frequency: data.kpiTrackingFrequency || null,
    analytics_review_frequency: data.analyticsReviewFrequency || null,
    does_ab_testing: data.doesAbTesting,
    who_handles_marketing: data.whoHandlesMarketing || null,
    monthly_marketing_budget: data.monthlyMarketingBudget || null,
    success_definition_3mo: data.successDefinition3mo || null,
    success_definition_6mo: data.successDefinition6mo || null,
    success_definition_12mo: data.successDefinition12mo || null,
    weekly_team_hours: data.weeklyTeamHours || null,
    past_marketing_failures: data.pastMarketingFailures || null,
    marketing_to_offload: data.marketingToOffload || null,
    biggest_marketing_frustration: data.biggestMarketingFrustration || null,
    suffering_from_weak_digital: data.sufferingFromWeakDigital || null,
    least_understood_marketing: data.leastUnderstoodMarketing || null,
    automation_wishlist: data.automationWishlist || null,
    biggest_agency_fear: data.biggestAgencyFear || null,
    priority_improvement: data.priorityImprovement || null,
    reason_seeking_help: data.reasonSeekingHelp || null,
    fastest_impact: data.fastestImpact || null,
    what_makes_it_worth_it: data.whatMakesItWorthIt || null,
    additional_notes: data.additionalNotes || null,
  };
}

function mapDbToFormData(data: Record<string, unknown>): GapAnalysisData {
  return {
    firstName: (data.first_name as string) || "",
    lastName: (data.last_name as string) || "",
    businessName: (data.business_name as string) || "",
    email: (data.email as string) || "",
    phone: (data.phone as string) || "",
    websiteUrl: (data.website_url as string) || "",
    topBusinessGoals: (data.top_business_goals as string) || "",
    growthSatisfaction: (data.growth_satisfaction as number) || 50,
    primaryCustomerSources: (data.primary_customer_sources as string) || "",
    topCompetitors: (data.top_competitors as string) || "",
    uniqueDifferentiator: (data.unique_differentiator as string) || "",
    hasSeasonality: data.has_seasonality as boolean | null,
    seasonalityDetails: (data.seasonality_details as string) || "",
    avgCustomerLifetimeValue: (data.avg_customer_lifetime_value as string) || "",
    revenueNewCustomersPct: (data.revenue_new_customers_pct as number) || 0,
    revenueRepeatCustomersPct: (data.revenue_repeat_customers_pct as number) || 0,
    revenueReferralsPct: (data.revenue_referrals_pct as number) || 0,
    socialMediaHandles: (data.social_media_handles as string) || "",
    websiteLastUpdated: (data.website_last_updated as string) || "",
    tracksWebsiteConversions: data.tracks_website_conversions as boolean | null,
    conversionTrackingMethod: (data.conversion_tracking_method as string) || "",
    monthlyWebsiteLeads: (data.monthly_website_leads as number) || 0,
    investingInSeo: data.investing_in_seo as boolean | null,
    rankingForKeywords: data.ranking_for_keywords as boolean | null,
    knowsOrganicTraffic: data.knows_organic_traffic as boolean | null,
    monthlyOrganicTraffic: (data.monthly_organic_traffic as number) || 0,
    trackingKeywordRankings: data.tracking_keyword_rankings as boolean | null,
    runningPaidAds: data.running_paid_ads as boolean | null,
    adPlatforms: (data.ad_platforms as string) || "",
    monthlyAdSpend: (data.monthly_ad_spend as string) || "",
    costPerLead: (data.cost_per_lead as string) || "",
    adsMatchCustomerIntent: data.ads_match_customer_intent as boolean | null,
    adManager: (data.ad_manager as string) || "",
    satisfiedWithAdPerformance: data.satisfied_with_ad_performance as boolean | null,
    adPerformanceNotes: (data.ad_performance_notes as string) || "",
    costPerAcquisition: (data.cost_per_acquisition as string) || "",
    runsRetargeting: data.runs_retargeting as boolean | null,
    adsUseLandingPages: data.ads_use_landing_pages as boolean | null,
    usesEmailAutomation: data.uses_email_automation as boolean | null,
    usesSmsFollowups: data.uses_sms_followups as boolean | null,
    hasCrm: data.has_crm as boolean | null,
    crmName: (data.crm_name as string) || "",
    crmTracksAllInbound: data.crm_tracks_all_inbound as boolean | null,
    hasSegmentationDrip: data.has_segmentation_drip as boolean | null,
    hasAbandonedFollowups: data.has_abandoned_followups as boolean | null,
    leadToCustomerConversionRate: (data.lead_to_customer_conversion_rate as string) || "",
    leadResponseTime: (data.lead_response_time as string) || "",
    closeRate: (data.close_rate as string) || "",
    commonObjections: (data.common_objections as string) || "",
    whereProspectsLost: (data.where_prospects_lost as string) || "",
    usesOnlineScheduling: data.uses_online_scheduling as boolean | null,
    avgTimeToQuote: (data.avg_time_to_quote as string) || "",
    asksForReviews: data.asks_for_reviews as boolean | null,
    monthlyNewReviews: (data.monthly_new_reviews as number) || 0,
    emailsPastCustomers: data.emails_past_customers as boolean | null,
    hasReputationTool: data.has_reputation_tool as boolean | null,
    reputationToolName: (data.reputation_tool_name as string) || "",
    repeatCustomerRate: (data.repeat_customer_rate as string) || "",
    hasLoyaltyReferralProgram: data.has_loyalty_referral_program as boolean | null,
    hasPostPurchaseFollowup: data.has_post_purchase_followup as boolean | null,
    usesGoogleAnalytics: data.uses_google_analytics as boolean | null,
    knowsBestLeadSources: data.knows_best_lead_sources as boolean | null,
    kpisTracked: (data.kpis_tracked as string) || "",
    dataAccuracyConfidence: (data.data_accuracy_confidence as string) || "",
    kpiTrackingFrequency: (data.kpi_tracking_frequency as string) || "",
    analyticsReviewFrequency: (data.analytics_review_frequency as string) || "",
    doesAbTesting: data.does_ab_testing as boolean | null,
    whoHandlesMarketing: (data.who_handles_marketing as string) || "",
    monthlyMarketingBudget: (data.monthly_marketing_budget as string) || "",
    successDefinition3mo: (data.success_definition_3mo as string) || "",
    successDefinition6mo: (data.success_definition_6mo as string) || "",
    successDefinition12mo: (data.success_definition_12mo as string) || "",
    weeklyTeamHours: (data.weekly_team_hours as string) || "",
    pastMarketingFailures: (data.past_marketing_failures as string) || "",
    marketingToOffload: (data.marketing_to_offload as string) || "",
    biggestMarketingFrustration: (data.biggest_marketing_frustration as string) || "",
    sufferingFromWeakDigital: (data.suffering_from_weak_digital as string) || "",
    leastUnderstoodMarketing: (data.least_understood_marketing as string) || "",
    automationWishlist: (data.automation_wishlist as string) || "",
    biggestAgencyFear: (data.biggest_agency_fear as string) || "",
    priorityImprovement: (data.priority_improvement as string) || "",
    reasonSeekingHelp: (data.reason_seeking_help as string) || "",
    fastestImpact: (data.fastest_impact as string) || "",
    whatMakesItWorthIt: (data.what_makes_it_worth_it as string) || "",
    additionalNotes: (data.additional_notes as string) || "",
  };
}

interface UseGapAnalysisOptions {
  resumeToken?: string | null;
  prefillEmail?: string | null;
  totalSteps: number;
}

export function useGapAnalysis({ resumeToken, prefillEmail, totalSteps }: UseGapAnalysisOptions) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<GapAnalysisData>({
    ...initialData,
    email: prefillEmail || "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(!!resumeToken);
  const [isComplete, setIsComplete] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submissionResumeToken, setSubmissionResumeToken] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (resumeToken) {
      loadSavedProgress();
    }
  }, [resumeToken]);

  const loadSavedProgress = async () => {
    try {
      const { data, error } = await supabase
        .from("gap_analysis_submissions")
        .select("*")
        .eq("resume_token", resumeToken)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setFormData(mapDbToFormData(data as Record<string, unknown>));
        if (data.current_step) setCurrentStep(data.current_step);

        toast({
          title: "Progress restored!",
          description: `Welcome back, ${data.first_name}. Continuing from Step ${data.current_step || 1}.`,
        });
      } else {
        toast({
          title: "Link expired",
          description: "We couldn't find your saved progress. Please start fresh.",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Failed to load saved progress:", err);
      toast({
        title: "Error loading progress",
        description: "Please try again or start fresh.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateFormData = useCallback((updates: Partial<GapAnalysisData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep < totalSteps) {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentStep, totalSteps]);

  const prevStep = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentStep]);

  const saveProgress = async () => {
    if (!formData.email || !formData.firstName) {
      toast({
        title: "Enter contact info first",
        description: "Please complete Step 1 before saving progress.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const { data, error } = await supabase.from("gap_analysis_submissions").insert({
        ...mapFormDataToDb(formData),
        current_step: currentStep,
        is_partial: true,
        status: "in_progress",
      }).select('resume_token').single();

      if (error) throw error;

      await supabase.functions.invoke("send-resume-link", {
        body: {
          email: formData.email,
          firstName: formData.firstName,
          resumeToken: data.resume_token,
          currentStep,
          totalSteps,
        },
      });

      try {
        const { error: seqError, data: seqData } = await supabase.functions.invoke("queue-sequence-emails", {
          body: {
            triggerType: "gap_analysis_partial",
            recipientEmail: formData.email,
            recipientName: formData.firstName,
            data: {
              businessName: formData.businessName,
              resumeToken: data.resume_token,
              currentStep,
              totalSteps,
            },
          },
        });
        const seqMsg = handleEdgeError(seqError, seqData);
        if (seqMsg) {
          console.error("Failed to queue reminder sequence:", seqMsg);
          toast({
            title: "Progress saved",
            description: "Your progress was saved but we couldn't schedule your reminder email. Please contact support if you don't receive it.",
            variant: "destructive",
          });
        }
      } catch (emailError) {
        console.error("Failed to queue reminder sequence:", emailError);
        toast({
          title: "Progress saved",
          description: "Your progress was saved but we couldn't schedule your reminder email. Please contact support if you don't receive it.",
          variant: "destructive",
        });
      }

      toast({
        title: "Progress Saved!",
        description: `We've emailed you a link to continue from Step ${currentStep}.`,
      });
    } catch (err) {
      console.error("Save progress failed:", err);
      toast({
        title: "Couldn't save progress",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      const dbData = mapFormDataToDb(formData);
      const { data: insertedData, error } = await supabase.from("gap_analysis_submissions").insert({
        ...dbData,
        status: "submitted",
        completed_at: new Date().toISOString(),
      }).select('id, resume_token').single();

      if (error) throw error;

      // Compute and persist SYSTEM scorecard
      try {
        const scorecard = calculateSystemScorecard(dbData);
        await supabase
          .from("gap_analysis_submissions")
          .update({
            overall_score: scorecard.overallScore,
            score_breakdown: scorecard.scores as any,
          })
          .eq("id", insertedData.id);
      } catch (scoreErr) {
        console.error("Failed to save scorecard:", scoreErr);
      }

      setSubmissionId(insertedData?.id || null);
      setSubmissionResumeToken(insertedData?.resume_token || null);
      setIsComplete(true);

      // Tie this submission back to an existing client_accounts row (context_profile +
      // intake_completed_at). Must run server-side: the marketing site has no client
      // session, and RLS blocks anon browser writes to client_accounts.
      try {
        await supabase.functions.invoke("sync-intake-context", {
          body: { submission_id: insertedData.id },
        });
      } catch (err) {
        console.error("Failed to sync intake context to client_accounts:", err);
      }

      try {
        const { error: seqError, data: seqData } = await supabase.functions.invoke("queue-sequence-emails", {
          body: {
            triggerType: "gap_analysis_complete",
            recipientEmail: formData.email,
            recipientName: formData.firstName,
            data: {
              businessName: formData.businessName,
              resumeToken: insertedData?.resume_token,
              submissionId: insertedData?.id,
              differentiator: formData.uniqueDifferentiator || '',
              primaryGoal: typeof formData.topBusinessGoals === 'string'
                ? formData.topBusinessGoals
                : (Array.isArray(formData.topBusinessGoals) ? (formData.topBusinessGoals as string[])[0] : '') || '',
              painPoint: formData.biggestMarketingFrustration || '',
              successCriteria: formData.whatMakesItWorthIt || '',
              urgency: formData.fastestImpact || '',
              websiteUrl: formData.websiteUrl || '',
            },
          },
        });
        const seqMsg = handleEdgeError(seqError, seqData);
        if (seqMsg) {
          console.error("Failed to queue email sequence:", seqMsg);
          toast({
            title: "Submission received",
            description: "Your analysis was submitted but we couldn't schedule your confirmation email. Please contact support if you don't receive it.",
            variant: "destructive",
          });
        }
      } catch (emailError) {
        console.error("Failed to queue email sequence:", emailError);
        toast({
          title: "Submission received",
          description: "Your analysis was submitted but we couldn't schedule your confirmation email. Please contact support if you don't receive it.",
          variant: "destructive",
        });
      }

      toast({
        title: "Gap Analysis Submitted!",
        description: "We'll analyze your responses and prepare your SYSTEM report.",
      });
    } catch (error) {
      toast({
        title: "Submission Failed",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    currentStep,
    formData,
    isSubmitting,
    isSaving,
    isLoading,
    isComplete,
    submissionId,
    submissionResumeToken,
    updateFormData,
    nextStep,
    prevStep,
    saveProgress,
    handleSubmit,
  };
}
