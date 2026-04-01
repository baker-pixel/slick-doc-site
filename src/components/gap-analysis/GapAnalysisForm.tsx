import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ContactInfoStep } from "./steps/ContactInfoStep";
import { BusinessFundamentalsStep } from "./steps/BusinessFundamentalsStep";
import { WebsiteConversionStep } from "./steps/WebsiteConversionStep";
import { SeoVisibilityStep } from "./steps/SeoVisibilityStep";
import { PaidAdsStep } from "./steps/PaidAdsStep";
import { LeadNurtureStep } from "./steps/LeadNurtureStep";
import { SalesEnablementStep } from "./steps/SalesEnablementStep";
import { RetentionReputationStep } from "./steps/RetentionReputationStep";
import { AnalyticsMeasurementStep } from "./steps/AnalyticsMeasurementStep";
import { InternalCapacityStep } from "./steps/InternalCapacityStep";
import { FinalAlignmentStep } from "./steps/FinalAlignmentStep";
import { ReportStep } from "./steps/ReportStep";

export type GapAnalysisData = {
  // Contact Info
  firstName: string;
  lastName: string;
  businessName: string;
  email: string;
  phone: string;
  websiteUrl: string;
  
  // Business Fundamentals
  topBusinessGoals: string;
  growthSatisfaction: number;
  primaryCustomerSources: string;
  topCompetitors: string;
  uniqueDifferentiator: string;
  hasSeasonality: boolean | null;
  seasonalityDetails: string;
  avgCustomerLifetimeValue: string;
  revenueNewCustomersPct: number;
  revenueRepeatCustomersPct: number;
  revenueReferralsPct: number;
  
  // Website & Conversion
  socialMediaHandles: string;
  websiteLastUpdated: string;
  tracksWebsiteConversions: boolean | null;
  conversionTrackingMethod: string;
  monthlyWebsiteLeads: number;
  
  // SEO & Visibility
  investingInSeo: boolean | null;
  rankingForKeywords: boolean | null;
  knowsOrganicTraffic: boolean | null;
  monthlyOrganicTraffic: number;
  trackingKeywordRankings: boolean | null;
  
  // Paid Ads
  runningPaidAds: boolean | null;
  adPlatforms: string;
  monthlyAdSpend: string;
  costPerLead: string;
  adsMatchCustomerIntent: boolean | null;
  adManager: string;
  satisfiedWithAdPerformance: boolean | null;
  adPerformanceNotes: string;
  costPerAcquisition: string;
  runsRetargeting: boolean | null;
  adsUseLandingPages: boolean | null;
  
  // Lead Nurture
  usesEmailAutomation: boolean | null;
  usesSmsFollowups: boolean | null;
  hasCrm: boolean | null;
  crmName: string;
  crmTracksAllInbound: boolean | null;
  hasSegmentationDrip: boolean | null;
  hasAbandonedFollowups: boolean | null;
  leadToCustomerConversionRate: string;
  
  // Sales Enablement
  leadResponseTime: string;
  closeRate: string;
  commonObjections: string;
  whereProspectsLost: string;
  usesOnlineScheduling: boolean | null;
  avgTimeToQuote: string;
  
  // Retention & Reputation
  asksForReviews: boolean | null;
  monthlyNewReviews: number;
  emailsPastCustomers: boolean | null;
  hasReputationTool: boolean | null;
  reputationToolName: string;
  repeatCustomerRate: string;
  hasLoyaltyReferralProgram: boolean | null;
  hasPostPurchaseFollowup: boolean | null;
  
  // Analytics
  usesGoogleAnalytics: boolean | null;
  knowsBestLeadSources: boolean | null;
  kpisTracked: string;
  dataAccuracyConfidence: string;
  kpiTrackingFrequency: string;
  analyticsReviewFrequency: string;
  doesAbTesting: boolean | null;
  
  // Internal Capacity
  whoHandlesMarketing: string;
  monthlyMarketingBudget: string;
  successDefinition3mo: string;
  successDefinition6mo: string;
  successDefinition12mo: string;
  weeklyTeamHours: string;
  pastMarketingFailures: string;
  marketingToOffload: string;
  
  // Final Alignment
  biggestMarketingFrustration: string;
  sufferingFromWeakDigital: string;
  leastUnderstoodMarketing: string;
  automationWishlist: string;
  biggestAgencyFear: string;
  priorityImprovement: string;
  reasonSeekingHelp: string;
  fastestImpact: string;
  whatMakesItWorthIt: string;
  additionalNotes: string;
};

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

const steps = [
  { id: 1, title: "Contact Info", component: ContactInfoStep },
  { id: 2, title: "Business Fundamentals", component: BusinessFundamentalsStep },
  { id: 3, title: "Website & Conversion", component: WebsiteConversionStep },
  { id: 4, title: "SEO & Visibility", component: SeoVisibilityStep },
  { id: 5, title: "Paid Advertising", component: PaidAdsStep },
  { id: 6, title: "Lead Nurture", component: LeadNurtureStep },
  { id: 7, title: "Sales Enablement", component: SalesEnablementStep },
  { id: 8, title: "Retention & Reviews", component: RetentionReputationStep },
  { id: 9, title: "Analytics", component: AnalyticsMeasurementStep },
  { id: 10, title: "Internal Capacity", component: InternalCapacityStep },
  { id: 11, title: "Final Questions", component: FinalAlignmentStep },
];

interface GapAnalysisFormProps {
  resumeToken?: string | null;
}

export function GapAnalysisForm({ resumeToken }: GapAnalysisFormProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<GapAnalysisData>(initialData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(!!resumeToken);
  const [isComplete, setIsComplete] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submissionResumeToken, setSubmissionResumeToken] = useState<string | null>(null);
  const { toast } = useToast();

  // Load saved progress if resumeToken exists
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
        // Map database fields back to form data
        setFormData({
          firstName: data.first_name || "",
          lastName: data.last_name || "",
          businessName: data.business_name || "",
          email: data.email || "",
          phone: data.phone || "",
          websiteUrl: data.website_url || "",
          topBusinessGoals: data.top_business_goals || "",
          growthSatisfaction: data.growth_satisfaction || 50,
          primaryCustomerSources: data.primary_customer_sources || "",
          topCompetitors: data.top_competitors || "",
          uniqueDifferentiator: data.unique_differentiator || "",
          hasSeasonality: data.has_seasonality,
          seasonalityDetails: data.seasonality_details || "",
          avgCustomerLifetimeValue: data.avg_customer_lifetime_value || "",
          revenueNewCustomersPct: data.revenue_new_customers_pct || 0,
          revenueRepeatCustomersPct: data.revenue_repeat_customers_pct || 0,
          revenueReferralsPct: data.revenue_referrals_pct || 0,
          socialMediaHandles: data.social_media_handles || "",
          websiteLastUpdated: data.website_last_updated || "",
          tracksWebsiteConversions: data.tracks_website_conversions,
          conversionTrackingMethod: data.conversion_tracking_method || "",
          monthlyWebsiteLeads: data.monthly_website_leads || 0,
          investingInSeo: data.investing_in_seo,
          rankingForKeywords: data.ranking_for_keywords,
          knowsOrganicTraffic: data.knows_organic_traffic,
          monthlyOrganicTraffic: data.monthly_organic_traffic || 0,
          trackingKeywordRankings: data.tracking_keyword_rankings,
          runningPaidAds: data.running_paid_ads,
          adPlatforms: data.ad_platforms || "",
          monthlyAdSpend: data.monthly_ad_spend || "",
          costPerLead: data.cost_per_lead || "",
          adsMatchCustomerIntent: data.ads_match_customer_intent,
          adManager: data.ad_manager || "",
          satisfiedWithAdPerformance: data.satisfied_with_ad_performance,
          adPerformanceNotes: data.ad_performance_notes || "",
          costPerAcquisition: data.cost_per_acquisition || "",
          runsRetargeting: data.runs_retargeting,
          adsUseLandingPages: data.ads_use_landing_pages,
          usesEmailAutomation: data.uses_email_automation,
          usesSmsFollowups: data.uses_sms_followups,
          hasCrm: data.has_crm,
          crmName: data.crm_name || "",
          crmTracksAllInbound: data.crm_tracks_all_inbound,
          hasSegmentationDrip: data.has_segmentation_drip,
          hasAbandonedFollowups: data.has_abandoned_followups,
          leadToCustomerConversionRate: data.lead_to_customer_conversion_rate || "",
          leadResponseTime: data.lead_response_time || "",
          closeRate: data.close_rate || "",
          commonObjections: data.common_objections || "",
          whereProspectsLost: data.where_prospects_lost || "",
          usesOnlineScheduling: data.uses_online_scheduling,
          avgTimeToQuote: data.avg_time_to_quote || "",
          asksForReviews: data.asks_for_reviews,
          monthlyNewReviews: data.monthly_new_reviews || 0,
          emailsPastCustomers: data.emails_past_customers,
          hasReputationTool: data.has_reputation_tool,
          reputationToolName: data.reputation_tool_name || "",
          repeatCustomerRate: data.repeat_customer_rate || "",
          hasLoyaltyReferralProgram: data.has_loyalty_referral_program,
          hasPostPurchaseFollowup: data.has_post_purchase_followup,
          usesGoogleAnalytics: data.uses_google_analytics,
          knowsBestLeadSources: data.knows_best_lead_sources,
          kpisTracked: data.kpis_tracked || "",
          dataAccuracyConfidence: data.data_accuracy_confidence || "",
          kpiTrackingFrequency: data.kpi_tracking_frequency || "",
          analyticsReviewFrequency: data.analytics_review_frequency || "",
          doesAbTesting: data.does_ab_testing,
          whoHandlesMarketing: data.who_handles_marketing || "",
          monthlyMarketingBudget: data.monthly_marketing_budget || "",
          successDefinition3mo: data.success_definition_3mo || "",
          successDefinition6mo: data.success_definition_6mo || "",
          successDefinition12mo: data.success_definition_12mo || "",
          weeklyTeamHours: data.weekly_team_hours || "",
          pastMarketingFailures: data.past_marketing_failures || "",
          marketingToOffload: data.marketing_to_offload || "",
          biggestMarketingFrustration: data.biggest_marketing_frustration || "",
          sufferingFromWeakDigital: data.suffering_from_weak_digital || "",
          leastUnderstoodMarketing: data.least_understood_marketing || "",
          automationWishlist: data.automation_wishlist || "",
          biggestAgencyFear: data.biggest_agency_fear || "",
          priorityImprovement: data.priority_improvement || "",
          reasonSeekingHelp: data.reason_seeking_help || "",
          fastestImpact: data.fastest_impact || "",
          whatMakesItWorthIt: data.what_makes_it_worth_it || "",
          additionalNotes: data.additional_notes || "",
        });
        
        // Set the saved step
        if (data.current_step) {
          setCurrentStep(data.current_step);
        }

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

  const mapFormDataToDb = (data: GapAnalysisData) => ({
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
  });

  const updateFormData = (updates: Partial<GapAnalysisData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const nextStep = () => {
    if (currentStep < steps.length) {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

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

      // Send resume email
      await supabase.functions.invoke("send-resume-link", {
        body: {
          email: formData.email,
          firstName: formData.firstName,
          resumeToken: data.resume_token,
          currentStep,
          totalSteps: steps.length,
        },
      });

      // Queue the partial gap analysis reminder sequence
      try {
        await supabase.functions.invoke("queue-sequence-emails", {
          body: {
            triggerType: "partial_gap_analysis",
            recipientEmail: formData.email,
            recipientName: formData.firstName,
            data: {
              businessName: formData.businessName,
              resumeToken: data.resume_token,
              currentStep,
              totalSteps: steps.length,
            },
          },
        });
      } catch (emailError) {
        console.error("Failed to queue reminder sequence:", emailError);
        // Don't fail save if email queueing fails
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
      const { data: insertedData, error } = await supabase.from("gap_analysis_submissions").insert({
        first_name: formData.firstName,
        last_name: formData.lastName,
        business_name: formData.businessName,
        email: formData.email,
        phone: formData.phone || null,
        website_url: formData.websiteUrl || null,
        top_business_goals: formData.topBusinessGoals || null,
        growth_satisfaction: formData.growthSatisfaction || null,
        primary_customer_sources: formData.primaryCustomerSources || null,
        top_competitors: formData.topCompetitors || null,
        unique_differentiator: formData.uniqueDifferentiator || null,
        has_seasonality: formData.hasSeasonality,
        seasonality_details: formData.seasonalityDetails || null,
        avg_customer_lifetime_value: formData.avgCustomerLifetimeValue || null,
        revenue_new_customers_pct: formData.revenueNewCustomersPct || null,
        revenue_repeat_customers_pct: formData.revenueRepeatCustomersPct || null,
        revenue_referrals_pct: formData.revenueReferralsPct || null,
        social_media_handles: formData.socialMediaHandles || null,
        website_last_updated: formData.websiteLastUpdated || null,
        tracks_website_conversions: formData.tracksWebsiteConversions,
        conversion_tracking_method: formData.conversionTrackingMethod || null,
        monthly_website_leads: formData.monthlyWebsiteLeads || null,
        investing_in_seo: formData.investingInSeo,
        ranking_for_keywords: formData.rankingForKeywords,
        knows_organic_traffic: formData.knowsOrganicTraffic,
        monthly_organic_traffic: formData.monthlyOrganicTraffic || null,
        tracking_keyword_rankings: formData.trackingKeywordRankings,
        running_paid_ads: formData.runningPaidAds,
        ad_platforms: formData.adPlatforms || null,
        monthly_ad_spend: formData.monthlyAdSpend || null,
        cost_per_lead: formData.costPerLead || null,
        ads_match_customer_intent: formData.adsMatchCustomerIntent,
        ad_manager: formData.adManager || null,
        satisfied_with_ad_performance: formData.satisfiedWithAdPerformance,
        ad_performance_notes: formData.adPerformanceNotes || null,
        cost_per_acquisition: formData.costPerAcquisition || null,
        runs_retargeting: formData.runsRetargeting,
        ads_use_landing_pages: formData.adsUseLandingPages,
        uses_email_automation: formData.usesEmailAutomation,
        uses_sms_followups: formData.usesSmsFollowups,
        has_crm: formData.hasCrm,
        crm_name: formData.crmName || null,
        crm_tracks_all_inbound: formData.crmTracksAllInbound,
        has_segmentation_drip: formData.hasSegmentationDrip,
        has_abandoned_followups: formData.hasAbandonedFollowups,
        lead_to_customer_conversion_rate: formData.leadToCustomerConversionRate || null,
        lead_response_time: formData.leadResponseTime || null,
        close_rate: formData.closeRate || null,
        common_objections: formData.commonObjections || null,
        where_prospects_lost: formData.whereProspectsLost || null,
        uses_online_scheduling: formData.usesOnlineScheduling,
        avg_time_to_quote: formData.avgTimeToQuote || null,
        asks_for_reviews: formData.asksForReviews,
        monthly_new_reviews: formData.monthlyNewReviews || null,
        emails_past_customers: formData.emailsPastCustomers,
        has_reputation_tool: formData.hasReputationTool,
        reputation_tool_name: formData.reputationToolName || null,
        repeat_customer_rate: formData.repeatCustomerRate || null,
        has_loyalty_referral_program: formData.hasLoyaltyReferralProgram,
        has_post_purchase_followup: formData.hasPostPurchaseFollowup,
        uses_google_analytics: formData.usesGoogleAnalytics,
        knows_best_lead_sources: formData.knowsBestLeadSources,
        kpis_tracked: formData.kpisTracked || null,
        data_accuracy_confidence: formData.dataAccuracyConfidence || null,
        kpi_tracking_frequency: formData.kpiTrackingFrequency || null,
        analytics_review_frequency: formData.analyticsReviewFrequency || null,
        does_ab_testing: formData.doesAbTesting,
        who_handles_marketing: formData.whoHandlesMarketing || null,
        monthly_marketing_budget: formData.monthlyMarketingBudget || null,
        success_definition_3mo: formData.successDefinition3mo || null,
        success_definition_6mo: formData.successDefinition6mo || null,
        success_definition_12mo: formData.successDefinition12mo || null,
        weekly_team_hours: formData.weeklyTeamHours || null,
        past_marketing_failures: formData.pastMarketingFailures || null,
        marketing_to_offload: formData.marketingToOffload || null,
        biggest_marketing_frustration: formData.biggestMarketingFrustration || null,
        suffering_from_weak_digital: formData.sufferingFromWeakDigital || null,
        least_understood_marketing: formData.leastUnderstoodMarketing || null,
        automation_wishlist: formData.automationWishlist || null,
        biggest_agency_fear: formData.biggestAgencyFear || null,
        priority_improvement: formData.priorityImprovement || null,
        reason_seeking_help: formData.reasonSeekingHelp || null,
        fastest_impact: formData.fastestImpact || null,
        what_makes_it_worth_it: formData.whatMakesItWorthIt || null,
        additional_notes: formData.additionalNotes || null,
        status: "submitted",
        completed_at: new Date().toISOString(),
      }).select('id, resume_token').single();

      if (error) throw error;

      setSubmissionId(insertedData?.id || null);
      setSubmissionResumeToken(insertedData?.resume_token || null);
      setIsComplete(true);

      // Queue the gap analysis completion email sequence
      try {
        await supabase.functions.invoke("queue-sequence-emails", {
          body: {
            triggerType: "gap_analysis_complete",
            recipientEmail: formData.email,
            recipientName: formData.firstName,
            data: {
              businessName: formData.businessName,
              resumeToken: insertedData?.resume_token,
              submissionId: insertedData?.id,
            },
          },
        });
      } catch (emailError) {
        console.error("Failed to queue email sequence:", emailError);
        // Don't fail the submission if email queueing fails
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

  if (isLoading) {
    return (
      <div className="w-full max-w-3xl mx-auto py-16 text-center">
        <Loader2 className="animate-spin mx-auto mb-4 text-primary" size={40} />
        <p className="text-muted-foreground">Restoring your progress...</p>
      </div>
    );
  }

  if (isComplete) {
    return <ReportStep formData={formData} submissionId={submissionId} resumeToken={submissionResumeToken} />;
  }

  const CurrentStepComponent = steps[currentStep - 1].component;

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-muted-foreground">
            Step {currentStep} of {steps.length}
          </span>
          <span className="text-sm font-medium text-primary">
            {steps[currentStep - 1].title}
          </span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${(currentStep / steps.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Step Indicators */}
      <div className="hidden md:flex justify-between mb-8 px-4">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium transition-colors ${
              step.id < currentStep
                ? "bg-primary text-primary-foreground"
                : step.id === currentStep
                ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {step.id < currentStep ? <Check size={14} /> : step.id}
          </div>
        ))}
      </div>

      {/* Form Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
          <CurrentStepComponent data={formData} updateData={updateFormData} />
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex flex-col gap-4 mt-8 pt-6 border-t border-border">
        <div className="flex flex-col-reverse sm:flex-row justify-between gap-3">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 1}
            className="gap-2 w-full sm:w-auto"
          >
            <ArrowLeft size={16} />
            Previous
          </Button>

          {currentStep === steps.length ? (
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="bg-primary hover:bg-orange-dark text-primary-foreground gap-2 w-full sm:w-auto"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  Submitting...
                </>
              ) : (
                <>
                  Submit Gap Analysis
                  <Check size={16} />
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={nextStep}
              className="bg-primary hover:bg-orange-dark text-primary-foreground gap-2 w-full sm:w-auto"
            >
              Next
              <ArrowRight size={16} />
            </Button>
          )}
        </div>
        
        {/* Save Progress - only show after step 1 */}
        {currentStep > 1 && formData.email && (
          <Button
            variant="ghost"
            onClick={saveProgress}
            disabled={isSaving}
            className="text-muted-foreground hover:text-foreground gap-2 w-full"
          >
            {isSaving ? (
              <>
                <Loader2 className="animate-spin" size={14} />
                Saving...
              </>
            ) : (
              <>
                <Save size={14} />
                Save Progress & Continue Later
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
