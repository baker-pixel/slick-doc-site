import { GapAnalysisData } from "../GapAnalysisForm";
import { FormField, TextInput, YesNoToggle } from "../FormField";

interface StepProps {
  data: GapAnalysisData;
  updateData: (updates: Partial<GapAnalysisData>) => void;
}

export function SeoVisibilityStep({ data, updateData }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-semibold text-foreground mb-2">
          SEO & Local Visibility
        </h2>
        <p className="text-muted-foreground">
          How visible is your business in search results?
        </p>
      </div>

      <FormField label="Are you currently investing in SEO or local SEO?">
        <YesNoToggle
          value={data.investingInSeo}
          onChange={(value) => updateData({ investingInSeo: value })}
        />
      </FormField>

      <FormField label="Are you ranking for your core service keywords?">
        <YesNoToggle
          value={data.rankingForKeywords}
          onChange={(value) => updateData({ rankingForKeywords: value })}
        />
      </FormField>

      <FormField label="Do you know your monthly organic traffic?">
        <YesNoToggle
          value={data.knowsOrganicTraffic}
          onChange={(value) => updateData({ knowsOrganicTraffic: value })}
        />
      </FormField>

      {data.knowsOrganicTraffic && (
        <FormField label="What is your monthly organic traffic?" optional>
          <TextInput
            type="number"
            min={0}
            value={data.monthlyOrganicTraffic || ""}
            onChange={(e) => updateData({ monthlyOrganicTraffic: Number(e.target.value) })}
            placeholder="e.g., 500 visits/month"
          />
        </FormField>
      )}

      <FormField label="Are you tracking keyword rankings?">
        <YesNoToggle
          value={data.trackingKeywordRankings}
          onChange={(value) => updateData({ trackingKeywordRankings: value })}
        />
      </FormField>
    </div>
  );
}
