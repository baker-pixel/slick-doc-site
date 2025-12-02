import { GapAnalysisData } from "../GapAnalysisForm";
import { FormField, TextInput, TextArea } from "../FormField";

interface StepProps {
  data: GapAnalysisData;
  updateData: (updates: Partial<GapAnalysisData>) => void;
}

export function InternalCapacityStep({ data, updateData }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-semibold text-foreground mb-2">
          Internal Capacity & Constraints
        </h2>
        <p className="text-muted-foreground">
          Help us understand your resources and what success looks like for you.
        </p>
      </div>

      <FormField label="Who currently handles marketing tasks?">
        <TextInput
          value={data.whoHandlesMarketing}
          onChange={(e) => updateData({ whoHandlesMarketing: e.target.value })}
          placeholder="e.g., Owner, Office manager, Marketing person, Agency..."
        />
      </FormField>

      <FormField label="What is your monthly marketing budget?">
        <TextInput
          value={data.monthlyMarketingBudget}
          onChange={(e) => updateData({ monthlyMarketingBudget: e.target.value })}
          placeholder="e.g., $500, $2,000, $5,000+, Flexible..."
        />
      </FormField>

      <div className="p-4 bg-secondary/50 rounded-lg space-y-4">
        <p className="text-sm font-medium text-foreground">
          What does success look like for you?
        </p>
        
        <FormField label="In 3 months">
          <TextInput
            value={data.successDefinition3mo}
            onChange={(e) => updateData({ successDefinition3mo: e.target.value })}
            placeholder="e.g., Get 20 more leads per month..."
          />
        </FormField>

        <FormField label="In 6 months">
          <TextInput
            value={data.successDefinition6mo}
            onChange={(e) => updateData({ successDefinition6mo: e.target.value })}
            placeholder="e.g., Increase revenue by 15%..."
          />
        </FormField>

        <FormField label="In 12 months">
          <TextInput
            value={data.successDefinition12mo}
            onChange={(e) => updateData({ successDefinition12mo: e.target.value })}
            placeholder="e.g., Become the #1 provider in my area..."
          />
        </FormField>
      </div>

      <FormField label="How much time can your team realistically commit weekly?" optional>
        <TextInput
          value={data.weeklyTeamHours}
          onChange={(e) => updateData({ weeklyTeamHours: e.target.value })}
          placeholder="e.g., 2 hours, 5 hours, Very limited..."
        />
      </FormField>

      <FormField label="What marketing efforts have failed in the past — and why?" optional>
        <TextArea
          value={data.pastMarketingFailures}
          onChange={(e) => updateData({ pastMarketingFailures: e.target.value })}
          placeholder="Share any past experiences that didn't work out..."
          rows={3}
        />
      </FormField>

      <FormField label="Which parts of marketing do you most want off your plate?" optional>
        <TextArea
          value={data.marketingToOffload}
          onChange={(e) => updateData({ marketingToOffload: e.target.value })}
          placeholder="e.g., Social media, SEO, Ads, Content creation..."
          rows={2}
        />
      </FormField>
    </div>
  );
}
