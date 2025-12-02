import { GapAnalysisData } from "../GapAnalysisForm";
import { FormField, TextInput, TextArea, YesNoToggle, SliderInput } from "../FormField";

interface StepProps {
  data: GapAnalysisData;
  updateData: (updates: Partial<GapAnalysisData>) => void;
}

export function BusinessFundamentalsStep({ data, updateData }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-semibold text-foreground mb-2">
          Business Fundamentals
        </h2>
        <p className="text-muted-foreground">
          Help us understand your business goals, customer base, and competitive landscape.
        </p>
      </div>

      <FormField 
        label="What are your top 1-3 business goals for the next 12 months?" 
        required
      >
        <TextArea
          value={data.topBusinessGoals}
          onChange={(e) => updateData({ topBusinessGoals: e.target.value })}
          placeholder="e.g., Increase revenue by 20%, expand service area, hire 3 new technicians..."
          rows={3}
        />
      </FormField>

      <FormField 
        label="On a 1-100% scale, how satisfied are you with your current growth trajectory?"
      >
        <SliderInput
          value={data.growthSatisfaction}
          onChange={(value) => updateData({ growthSatisfaction: value })}
        />
      </FormField>

      <FormField label="What are your primary sources of new customers today?">
        <TextArea
          value={data.primaryCustomerSources}
          onChange={(e) => updateData({ primaryCustomerSources: e.target.value })}
          placeholder="e.g., Word of mouth, Google search, social media, referrals..."
          rows={2}
        />
      </FormField>

      <FormField label="Who are your top competitors?">
        <TextArea
          value={data.topCompetitors}
          onChange={(e) => updateData({ topCompetitors: e.target.value })}
          placeholder="List 2-3 of your main competitors..."
          rows={2}
        />
      </FormField>

      <FormField label="What makes your business different (in your words)?">
        <TextArea
          value={data.uniqueDifferentiator}
          onChange={(e) => updateData({ uniqueDifferentiator: e.target.value })}
          placeholder="What sets you apart from your competition?"
          rows={2}
        />
      </FormField>

      <FormField label="Do you have seasonality in demand?" optional>
        <YesNoToggle
          value={data.hasSeasonality}
          onChange={(value) => updateData({ hasSeasonality: value })}
        />
      </FormField>

      {data.hasSeasonality && (
        <FormField label="Describe your seasonal patterns" optional>
          <TextInput
            value={data.seasonalityDetails}
            onChange={(e) => updateData({ seasonalityDetails: e.target.value })}
            placeholder="e.g., Busy summer, slow winter..."
          />
        </FormField>
      )}

      <FormField label="What is your average customer lifetime value?" optional>
        <TextInput
          value={data.avgCustomerLifetimeValue}
          onChange={(e) => updateData({ avgCustomerLifetimeValue: e.target.value })}
          placeholder="e.g., $500, $2,000, Not sure..."
        />
      </FormField>

      <div className="p-4 bg-secondary/50 rounded-lg space-y-4">
        <p className="text-sm font-medium text-foreground">
          What percentage of revenue comes from: (optional)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FormField label="New Customers">
            <TextInput
              type="number"
              min={0}
              max={100}
              value={data.revenueNewCustomersPct || ""}
              onChange={(e) => updateData({ revenueNewCustomersPct: Number(e.target.value) })}
              placeholder="%"
            />
          </FormField>
          <FormField label="Repeat Customers">
            <TextInput
              type="number"
              min={0}
              max={100}
              value={data.revenueRepeatCustomersPct || ""}
              onChange={(e) => updateData({ revenueRepeatCustomersPct: Number(e.target.value) })}
              placeholder="%"
            />
          </FormField>
          <FormField label="Referrals">
            <TextInput
              type="number"
              min={0}
              max={100}
              value={data.revenueReferralsPct || ""}
              onChange={(e) => updateData({ revenueReferralsPct: Number(e.target.value) })}
              placeholder="%"
            />
          </FormField>
        </div>
      </div>
    </div>
  );
}
