import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Check, X } from "lucide-react";

interface GapAnalysisData {
  id: string;
  first_name: string;
  last_name: string;
  business_name: string;
  email: string;
  phone: string | null;
  website_url: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  // Business Fundamentals
  top_business_goals?: string | null;
  primary_customer_sources?: string | null;
  top_competitors?: string | null;
  unique_differentiator?: string | null;
  has_seasonality?: boolean | null;
  seasonality_details?: string | null;
  avg_customer_lifetime_value?: string | null;
  growth_satisfaction?: number | null;
  // Website & Conversion
  website_last_updated?: string | null;
  tracks_website_conversions?: boolean | null;
  monthly_website_leads?: number | null;
  priority_improvement?: string | null;
  // SEO
  investing_in_seo?: boolean | null;
  ranking_for_keywords?: boolean | null;
  knows_organic_traffic?: boolean | null;
  monthly_organic_traffic?: number | null;
  tracking_keyword_rankings?: boolean | null;
  // Paid Ads
  running_paid_ads?: boolean | null;
  ad_platforms?: string | null;
  monthly_ad_spend?: string | null;
  ad_manager?: string | null;
  ads_match_customer_intent?: boolean | null;
  satisfied_with_ad_performance?: boolean | null;
  runs_retargeting?: boolean | null;
  ads_use_landing_pages?: boolean | null;
  cost_per_lead?: string | null;
  ad_performance_notes?: string | null;
  // Lead Nurture
  uses_email_automation?: boolean | null;
  uses_sms_followups?: boolean | null;
  has_crm?: boolean | null;
  crm_name?: string | null;
  crm_tracks_all_inbound?: boolean | null;
  has_segmentation_drip?: boolean | null;
  has_abandoned_followups?: boolean | null;
  // Sales Enablement
  uses_online_scheduling?: boolean | null;
  lead_response_time?: string | null;
  avg_time_to_quote?: string | null;
  close_rate?: string | null;
  common_objections?: string | null;
  where_prospects_lost?: string | null;
  // Retention & Reputation
  asks_for_reviews?: boolean | null;
  monthly_new_reviews?: number | null;
  has_reputation_tool?: boolean | null;
  reputation_tool_name?: string | null;
  emails_past_customers?: boolean | null;
  repeat_customer_rate?: string | null;
  has_loyalty_referral_program?: boolean | null;
  has_post_purchase_followup?: boolean | null;
  // Analytics
  uses_google_analytics?: boolean | null;
  knows_best_lead_sources?: boolean | null;
  conversion_tracking_method?: string | null;
  kpis_tracked?: string | null;
  kpi_tracking_frequency?: string | null;
  analytics_review_frequency?: string | null;
  data_accuracy_confidence?: string | null;
  does_ab_testing?: boolean | null;
  // Internal Capacity
  who_handles_marketing?: string | null;
  weekly_team_hours?: string | null;
  monthly_marketing_budget?: string | null;
  marketing_to_offload?: string | null;
  automation_wishlist?: string | null;
  past_marketing_failures?: string | null;
  // Final Alignment
  reason_seeking_help?: string | null;
  biggest_marketing_frustration?: string | null;
  suffering_from_weak_digital?: string | null;
  biggest_agency_fear?: string | null;
  fastest_impact?: string | null;
  what_makes_it_worth_it?: string | null;
  success_definition_3mo?: string | null;
  success_definition_6mo?: string | null;
  success_definition_12mo?: string | null;
  additional_notes?: string | null;
}

interface Props {
  data: GapAnalysisData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BooleanValue = ({ value }: { value: boolean | null }) => {
  if (value === null) return <span className="text-muted-foreground">-</span>;
  return value ? (
    <span className="inline-flex items-center gap-1 text-green-600"><Check className="w-4 h-4" /> Yes</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-red-600"><X className="w-4 h-4" /> No</span>
  );
};

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="py-2">
    <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
    <dd className="mt-1 text-sm">{value || <span className="text-muted-foreground">-</span>}</dd>
  </div>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-6">
    <h3 className="text-lg font-semibold mb-3 text-primary">{title}</h3>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
      {children}
    </div>
    <Separator className="mt-4" />
  </div>
);

export function GapAnalysisDetailModal({ data, open, onOpenChange }: Props) {
  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {data.first_name} {data.last_name} - {data.business_name}
            <Badge>{data.status}</Badge>
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="h-[70vh] pr-4">
          <Section title="Contact Information">
            <Field label="Name" value={`${data.first_name} ${data.last_name}`} />
            <Field label="Business" value={data.business_name} />
            <Field label="Email" value={data.email} />
            <Field label="Phone" value={data.phone} />
            <Field label="Website" value={data.website_url} />
            <Field label="Submitted" value={new Date(data.created_at).toLocaleString()} />
          </Section>

          <Section title="Business Fundamentals">
            <Field label="Top Business Goals" value={data.top_business_goals} />
            <Field label="Primary Customer Sources" value={data.primary_customer_sources} />
            <Field label="Top Competitors" value={data.top_competitors} />
            <Field label="Unique Differentiator" value={data.unique_differentiator} />
            <Field label="Has Seasonality" value={<BooleanValue value={data.has_seasonality} />} />
            <Field label="Seasonality Details" value={data.seasonality_details} />
            <Field label="Avg Customer Lifetime Value" value={data.avg_customer_lifetime_value} />
            <Field label="Growth Satisfaction (1-10)" value={data.growth_satisfaction} />
          </Section>

          <Section title="Website & Conversion">
            <Field label="Website Last Updated" value={data.website_last_updated} />
            <Field label="Tracks Website Conversions" value={<BooleanValue value={data.tracks_website_conversions} />} />
            <Field label="Monthly Website Leads" value={data.monthly_website_leads} />
            <Field label="Priority Improvement" value={data.priority_improvement} />
          </Section>

          <Section title="SEO & Visibility">
            <Field label="Investing in SEO" value={<BooleanValue value={data.investing_in_seo} />} />
            <Field label="Ranking for Keywords" value={<BooleanValue value={data.ranking_for_keywords} />} />
            <Field label="Knows Organic Traffic" value={<BooleanValue value={data.knows_organic_traffic} />} />
            <Field label="Monthly Organic Traffic" value={data.monthly_organic_traffic} />
            <Field label="Tracking Keyword Rankings" value={<BooleanValue value={data.tracking_keyword_rankings} />} />
          </Section>

          <Section title="Paid Advertising">
            <Field label="Running Paid Ads" value={<BooleanValue value={data.running_paid_ads} />} />
            <Field label="Ad Platforms" value={data.ad_platforms} />
            <Field label="Monthly Ad Spend" value={data.monthly_ad_spend} />
            <Field label="Ad Manager" value={data.ad_manager} />
            <Field label="Ads Match Customer Intent" value={<BooleanValue value={data.ads_match_customer_intent} />} />
            <Field label="Satisfied with Ad Performance" value={<BooleanValue value={data.satisfied_with_ad_performance} />} />
            <Field label="Runs Retargeting" value={<BooleanValue value={data.runs_retargeting} />} />
            <Field label="Uses Landing Pages" value={<BooleanValue value={data.ads_use_landing_pages} />} />
            <Field label="Cost Per Lead" value={data.cost_per_lead} />
            <Field label="Ad Performance Notes" value={data.ad_performance_notes} />
          </Section>

          <Section title="Lead Nurture">
            <Field label="Uses Email Automation" value={<BooleanValue value={data.uses_email_automation} />} />
            <Field label="Uses SMS Followups" value={<BooleanValue value={data.uses_sms_followups} />} />
            <Field label="Has CRM" value={<BooleanValue value={data.has_crm} />} />
            <Field label="CRM Name" value={data.crm_name} />
            <Field label="CRM Tracks All Inbound" value={<BooleanValue value={data.crm_tracks_all_inbound} />} />
            <Field label="Has Segmentation/Drip" value={<BooleanValue value={data.has_segmentation_drip} />} />
            <Field label="Has Abandoned Followups" value={<BooleanValue value={data.has_abandoned_followups} />} />
          </Section>

          <Section title="Sales Enablement">
            <Field label="Uses Online Scheduling" value={<BooleanValue value={data.uses_online_scheduling} />} />
            <Field label="Lead Response Time" value={data.lead_response_time} />
            <Field label="Avg Time to Quote" value={data.avg_time_to_quote} />
            <Field label="Close Rate" value={data.close_rate} />
            <Field label="Common Objections" value={data.common_objections} />
            <Field label="Where Prospects Lost" value={data.where_prospects_lost} />
          </Section>

          <Section title="Retention & Reputation">
            <Field label="Asks for Reviews" value={<BooleanValue value={data.asks_for_reviews} />} />
            <Field label="Monthly New Reviews" value={data.monthly_new_reviews} />
            <Field label="Has Reputation Tool" value={<BooleanValue value={data.has_reputation_tool} />} />
            <Field label="Reputation Tool Name" value={data.reputation_tool_name} />
            <Field label="Emails Past Customers" value={<BooleanValue value={data.emails_past_customers} />} />
            <Field label="Repeat Customer Rate" value={data.repeat_customer_rate} />
            <Field label="Has Loyalty/Referral Program" value={<BooleanValue value={data.has_loyalty_referral_program} />} />
            <Field label="Has Post-Purchase Followup" value={<BooleanValue value={data.has_post_purchase_followup} />} />
          </Section>

          <Section title="Analytics & Measurement">
            <Field label="Uses Google Analytics" value={<BooleanValue value={data.uses_google_analytics} />} />
            <Field label="Knows Best Lead Sources" value={<BooleanValue value={data.knows_best_lead_sources} />} />
            <Field label="Conversion Tracking Method" value={data.conversion_tracking_method} />
            <Field label="KPIs Tracked" value={data.kpis_tracked} />
            <Field label="KPI Tracking Frequency" value={data.kpi_tracking_frequency} />
            <Field label="Analytics Review Frequency" value={data.analytics_review_frequency} />
            <Field label="Data Accuracy Confidence" value={data.data_accuracy_confidence} />
            <Field label="Does A/B Testing" value={<BooleanValue value={data.does_ab_testing} />} />
          </Section>

          <Section title="Internal Capacity">
            <Field label="Who Handles Marketing" value={data.who_handles_marketing} />
            <Field label="Weekly Team Hours" value={data.weekly_team_hours} />
            <Field label="Monthly Marketing Budget" value={data.monthly_marketing_budget} />
            <Field label="Marketing to Offload" value={data.marketing_to_offload} />
            <Field label="Automation Wishlist" value={data.automation_wishlist} />
            <Field label="Past Marketing Failures" value={data.past_marketing_failures} />
          </Section>

          <Section title="Final Alignment">
            <Field label="Reason Seeking Help" value={data.reason_seeking_help} />
            <Field label="Biggest Marketing Frustration" value={data.biggest_marketing_frustration} />
            <Field label="Suffering from Weak Digital" value={data.suffering_from_weak_digital} />
            <Field label="Biggest Agency Fear" value={data.biggest_agency_fear} />
            <Field label="Fastest Impact" value={data.fastest_impact} />
            <Field label="What Makes It Worth It" value={data.what_makes_it_worth_it} />
            <Field label="Success Definition (3mo)" value={data.success_definition_3mo} />
            <Field label="Success Definition (6mo)" value={data.success_definition_6mo} />
            <Field label="Success Definition (12mo)" value={data.success_definition_12mo} />
            <Field label="Additional Notes" value={data.additional_notes} />
          </Section>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
