import { GapAnalysisData } from "../GapAnalysisForm";
import { FormField, TextInput, TextArea, YesNoToggle } from "../FormField";

interface StepProps {
  data: GapAnalysisData;
  updateData: (updates: Partial<GapAnalysisData>) => void;
}

export function PaidAdsStep({ data, updateData }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-semibold text-foreground mb-2">
          Paid Advertising
        </h2>
        <p className="text-muted-foreground">
          Tell us about your paid advertising efforts (search & social).
        </p>
      </div>

      <FormField label="Are you currently running paid ads?">
        <YesNoToggle
          value={data.runningPaidAds}
          onChange={(value) => updateData({ runningPaidAds: value })}
        />
      </FormField>

      {data.runningPaidAds && (
        <>
          <FormField label="Where are you running ads?">
            <TextInput
              value={data.adPlatforms}
              onChange={(e) => updateData({ adPlatforms: e.target.value })}
              placeholder="e.g., Google Ads, Facebook, Instagram, Yelp..."
            />
          </FormField>

          <FormField label="What is your monthly ad spend?">
            <TextInput
              value={data.monthlyAdSpend}
              onChange={(e) => updateData({ monthlyAdSpend: e.target.value })}
              placeholder="e.g., $500, $2,000, $5,000+"
            />
          </FormField>

          <FormField label="What is your cost per lead (CPL)?" optional>
            <TextInput
              value={data.costPerLead}
              onChange={(e) => updateData({ costPerLead: e.target.value })}
              placeholder="e.g., $25, $50, Not sure..."
            />
          </FormField>

          <FormField label="Do your ads match your actual customer intent?">
            <YesNoToggle
              value={data.adsMatchCustomerIntent}
              onChange={(value) => updateData({ adsMatchCustomerIntent: value })}
            />
          </FormField>

          <FormField label="Who manages your ads today?" optional>
            <TextInput
              value={data.adManager}
              onChange={(e) => updateData({ adManager: e.target.value })}
              placeholder="e.g., In-house, Agency, Freelancer, Self..."
            />
          </FormField>

          <FormField label="Are you satisfied with their performance?">
            <YesNoToggle
              value={data.satisfiedWithAdPerformance}
              onChange={(value) => updateData({ satisfiedWithAdPerformance: value })}
            />
          </FormField>

          {data.satisfiedWithAdPerformance === false && (
            <FormField label="Why not? What could be better?" optional>
              <TextArea
                value={data.adPerformanceNotes}
                onChange={(e) => updateData({ adPerformanceNotes: e.target.value })}
                placeholder="Tell us what's not working..."
                rows={2}
              />
            </FormField>
          )}

          <FormField label="What is your cost per acquisition (CPA)?" optional>
            <TextInput
              value={data.costPerAcquisition}
              onChange={(e) => updateData({ costPerAcquisition: e.target.value })}
              placeholder="e.g., $100, $250, Not sure..."
            />
          </FormField>

          <FormField label="Do you run retargeting ads?">
            <YesNoToggle
              value={data.runsRetargeting}
              onChange={(value) => updateData({ runsRetargeting: value })}
            />
          </FormField>

          <FormField label="Are your ads going to dedicated landing pages?">
            <YesNoToggle
              value={data.adsUseLandingPages}
              onChange={(value) => updateData({ adsUseLandingPages: value })}
            />
          </FormField>
        </>
      )}

      {data.runningPaidAds === false && (
        <div className="p-4 bg-secondary/50 rounded-lg">
          <p className="text-sm text-muted-foreground">
            No worries! Paid ads aren&apos;t for everyone. We&apos;ll focus on other 
            areas where you can grow your visibility.
          </p>
        </div>
      )}
    </div>
  );
}
