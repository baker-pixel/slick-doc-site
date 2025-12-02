import { GapAnalysisData } from "../GapAnalysisForm";
import { FormField, TextArea } from "../FormField";

interface StepProps {
  data: GapAnalysisData;
  updateData: (updates: Partial<GapAnalysisData>) => void;
}

export function FinalAlignmentStep({ data, updateData }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-semibold text-foreground mb-2">
          Final Questions
        </h2>
        <p className="text-muted-foreground">
          A few more questions to help us understand your priorities and concerns.
        </p>
      </div>

      <FormField label="What frustrates you most about your marketing experience so far?" optional>
        <TextArea
          value={data.biggestMarketingFrustration}
          onChange={(e) => updateData({ biggestMarketingFrustration: e.target.value })}
          placeholder="Be honest — we want to help solve the real problems..."
          rows={3}
        />
      </FormField>

      <FormField label="What part of your business is suffering most due to weak digital presence?" optional>
        <TextArea
          value={data.sufferingFromWeakDigital}
          onChange={(e) => updateData({ sufferingFromWeakDigital: e.target.value })}
          placeholder="e.g., Lead generation, brand awareness, sales..."
          rows={2}
        />
      </FormField>

      <FormField label="What part of marketing do you understand the least?" optional>
        <TextArea
          value={data.leastUnderstoodMarketing}
          onChange={(e) => updateData({ leastUnderstoodMarketing: e.target.value })}
          placeholder="e.g., SEO, paid ads, analytics, automation..."
          rows={2}
        />
      </FormField>

      <FormField label="If you could automate one part of the customer journey, what would it be?" optional>
        <TextArea
          value={data.automationWishlist}
          onChange={(e) => updateData({ automationWishlist: e.target.value })}
          placeholder="e.g., Follow-up emails, appointment reminders, review requests..."
          rows={2}
        />
      </FormField>

      <FormField label="What is your biggest fear when working with a marketing agency?" optional>
        <TextArea
          value={data.biggestAgencyFear}
          onChange={(e) => updateData({ biggestAgencyFear: e.target.value })}
          placeholder="Be honest — we take this seriously..."
          rows={2}
        />
      </FormField>

      <div className="border-t border-border pt-6 mt-6">
        <h3 className="font-semibold text-foreground mb-4">Strategic Alignment</h3>

        <FormField label="If we could only improve ONE thing in your marketing system first, what should it be?" required>
          <TextArea
            value={data.priorityImprovement}
            onChange={(e) => updateData({ priorityImprovement: e.target.value })}
            placeholder="What's the most important thing to fix?"
            rows={2}
          />
        </FormField>

        <FormField label="What is the main reason you are seeking help right now?">
          <TextArea
            value={data.reasonSeekingHelp}
            onChange={(e) => updateData({ reasonSeekingHelp: e.target.value })}
            placeholder="What triggered you to reach out today?"
            rows={2}
          />
        </FormField>

        <FormField label="What would give you the fastest and most meaningful impact?" optional>
          <TextArea
            value={data.fastestImpact}
            onChange={(e) => updateData({ fastestImpact: e.target.value })}
            placeholder="Quick wins you're hoping to achieve..."
            rows={2}
          />
        </FormField>

        <FormField label='What would make working with a consultant "worth it" for you?' optional>
          <TextArea
            value={data.whatMakesItWorthIt}
            onChange={(e) => updateData({ whatMakesItWorthIt: e.target.value })}
            placeholder="What outcome would make this investment worthwhile?"
            rows={2}
          />
        </FormField>

        <FormField label="Is there anything else we should know before building your Blueprint?" optional>
          <TextArea
            value={data.additionalNotes}
            onChange={(e) => updateData({ additionalNotes: e.target.value })}
            placeholder="Any other details, context, or concerns..."
            rows={3}
          />
        </FormField>
      </div>
    </div>
  );
}
