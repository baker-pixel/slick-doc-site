import { GapAnalysisData } from "../GapAnalysisForm";
import { FormField, TextInput, TextArea, YesNoToggle } from "../FormField";

interface StepProps {
  data: GapAnalysisData;
  updateData: (updates: Partial<GapAnalysisData>) => void;
}

export function WebsiteConversionStep({ data, updateData }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-semibold text-foreground mb-2">
          Website & Conversion Infrastructure
        </h2>
        <p className="text-muted-foreground">
          Tell us about your current website and how you&apos;re capturing leads.
        </p>
      </div>

      <FormField 
        label="What social media handles do you use?" 
        hint="Facebook, Instagram, X, TikTok, LinkedIn, etc."
        optional
      >
        <TextArea
          value={data.socialMediaHandles}
          onChange={(e) => updateData({ socialMediaHandles: e.target.value })}
          placeholder="@yourbusiness on Facebook, Instagram, etc."
          rows={2}
        />
      </FormField>

      <FormField label="When was your website last updated or redesigned?">
        <TextInput
          value={data.websiteLastUpdated}
          onChange={(e) => updateData({ websiteLastUpdated: e.target.value })}
          placeholder="e.g., 2023, 2 years ago, Never had one..."
        />
      </FormField>

      <FormField label="Do you track website conversions?">
        <YesNoToggle
          value={data.tracksWebsiteConversions}
          onChange={(value) => updateData({ tracksWebsiteConversions: value })}
        />
      </FormField>

      {data.tracksWebsiteConversions && (
        <FormField label="How do you track conversions?">
          <TextInput
            value={data.conversionTrackingMethod}
            onChange={(e) => updateData({ conversionTrackingMethod: e.target.value })}
            placeholder="e.g., Google Analytics, form submissions, phone tracking..."
          />
        </FormField>
      )}

      <FormField label="How many leads does your website generate per month?" optional>
        <TextInput
          type="number"
          min={0}
          value={data.monthlyWebsiteLeads || ""}
          onChange={(e) => updateData({ monthlyWebsiteLeads: Number(e.target.value) })}
          placeholder="e.g., 10, 50, Not sure..."
        />
      </FormField>
    </div>
  );
}
