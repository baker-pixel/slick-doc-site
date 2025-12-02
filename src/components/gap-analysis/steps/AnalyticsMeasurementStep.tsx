import { GapAnalysisData } from "../GapAnalysisForm";
import { FormField, TextInput, TextArea, YesNoToggle } from "../FormField";

interface StepProps {
  data: GapAnalysisData;
  updateData: (updates: Partial<GapAnalysisData>) => void;
}

export function AnalyticsMeasurementStep({ data, updateData }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-semibold text-foreground mb-2">
          Analytics & Measurement
        </h2>
        <p className="text-muted-foreground">
          How do you track what&apos;s working and make data-driven decisions?
        </p>
      </div>

      <FormField label="Do you use Google Analytics (or similar)?">
        <YesNoToggle
          value={data.usesGoogleAnalytics}
          onChange={(value) => updateData({ usesGoogleAnalytics: value })}
        />
      </FormField>

      <FormField label="Do you know where your best leads come from?">
        <YesNoToggle
          value={data.knowsBestLeadSources}
          onChange={(value) => updateData({ knowsBestLeadSources: value })}
        />
      </FormField>

      <FormField label="Which KPIs do you track?" optional>
        <TextArea
          value={data.kpisTracked}
          onChange={(e) => updateData({ kpisTracked: e.target.value })}
          placeholder="e.g., Revenue, lead volume, close rate, customer acquisition cost..."
          rows={2}
        />
      </FormField>

      <FormField label="How confident are you in your data accuracy?" optional>
        <TextInput
          value={data.dataAccuracyConfidence}
          onChange={(e) => updateData({ dataAccuracyConfidence: e.target.value })}
          placeholder="e.g., Very confident, Somewhat, Not at all..."
        />
      </FormField>

      <FormField label="How often do you track your KPIs?" optional>
        <TextInput
          value={data.kpiTrackingFrequency}
          onChange={(e) => updateData({ kpiTrackingFrequency: e.target.value })}
          placeholder="e.g., Daily, Weekly, Monthly, Rarely..."
        />
      </FormField>

      <FormField label="How often do you review your analytics?" optional>
        <TextInput
          value={data.analyticsReviewFrequency}
          onChange={(e) => updateData({ analyticsReviewFrequency: e.target.value })}
          placeholder="e.g., Weekly, Monthly, Quarterly, Never..."
        />
      </FormField>

      <FormField label="Do you do any A/B testing?">
        <YesNoToggle
          value={data.doesAbTesting}
          onChange={(value) => updateData({ doesAbTesting: value })}
        />
      </FormField>
    </div>
  );
}
