import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGapAnalysis } from "@/hooks/use-gap-analysis";
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
  prefillEmail?: string | null;
}

export function GapAnalysisForm({ resumeToken, prefillEmail }: GapAnalysisFormProps) {
  const {
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
  } = useGapAnalysis({ resumeToken, prefillEmail, totalSteps: steps.length });

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
