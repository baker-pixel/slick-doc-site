import { GapAnalysisData } from "../GapAnalysisForm";
import { FormField, TextInput, YesNoToggle } from "../FormField";

interface StepProps {
  data: GapAnalysisData;
  updateData: (updates: Partial<GapAnalysisData>) => void;
}

export function RetentionReputationStep({ data, updateData }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-semibold text-foreground mb-2">
          Retention & Reputation
        </h2>
        <p className="text-muted-foreground">
          How do you keep customers coming back and generate reviews?
        </p>
      </div>

      <FormField label="Do you actively ask for reviews?">
        <YesNoToggle
          value={data.asksForReviews}
          onChange={(value) => updateData({ asksForReviews: value })}
        />
      </FormField>

      <FormField label="How many new reviews do you generate per month?" optional>
        <TextInput
          type="number"
          min={0}
          value={data.monthlyNewReviews || ""}
          onChange={(e) => updateData({ monthlyNewReviews: Number(e.target.value) })}
          placeholder="e.g., 5, 10, 20..."
        />
      </FormField>

      <FormField label="Do you email past customers regularly?">
        <YesNoToggle
          value={data.emailsPastCustomers}
          onChange={(value) => updateData({ emailsPastCustomers: value })}
        />
      </FormField>

      <FormField label="Do you have a reputation management tool?">
        <YesNoToggle
          value={data.hasReputationTool}
          onChange={(value) => updateData({ hasReputationTool: value })}
        />
      </FormField>

      {data.hasReputationTool && (
        <FormField label="Which tool do you use?">
          <TextInput
            value={data.reputationToolName}
            onChange={(e) => updateData({ reputationToolName: e.target.value })}
            placeholder="e.g., Birdeye, Podium, ReviewTrackers..."
          />
        </FormField>
      )}

      <FormField label="What is your repeat customer rate?" optional>
        <TextInput
          value={data.repeatCustomerRate}
          onChange={(e) => updateData({ repeatCustomerRate: e.target.value })}
          placeholder="e.g., 30%, 50%, Not sure..."
        />
      </FormField>

      <FormField label="Do you have loyalty or referral incentives?">
        <YesNoToggle
          value={data.hasLoyaltyReferralProgram}
          onChange={(value) => updateData({ hasLoyaltyReferralProgram: value })}
        />
      </FormField>

      <FormField label="Do you have a systematic post-purchase follow-up?">
        <YesNoToggle
          value={data.hasPostPurchaseFollowup}
          onChange={(value) => updateData({ hasPostPurchaseFollowup: value })}
        />
      </FormField>
    </div>
  );
}
