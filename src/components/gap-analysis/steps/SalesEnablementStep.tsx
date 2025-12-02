import { GapAnalysisData } from "../GapAnalysisForm";
import { FormField, TextInput, TextArea, YesNoToggle } from "../FormField";

interface StepProps {
  data: GapAnalysisData;
  updateData: (updates: Partial<GapAnalysisData>) => void;
}

export function SalesEnablementStep({ data, updateData }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-semibold text-foreground mb-2">
          Sales Enablement
        </h2>
        <p className="text-muted-foreground">
          How efficiently do you convert warm leads into paying customers?
        </p>
      </div>

      <FormField label="How fast do you respond to new leads?">
        <TextInput
          value={data.leadResponseTime}
          onChange={(e) => updateData({ leadResponseTime: e.target.value })}
          placeholder="e.g., Within 5 minutes, Same day, Next business day..."
        />
      </FormField>

      <FormField label="What is your close rate from leads to customers?" optional>
        <TextInput
          value={data.closeRate}
          onChange={(e) => updateData({ closeRate: e.target.value })}
          placeholder="e.g., 20%, 35%, Not sure..."
        />
      </FormField>

      <FormField label="What objections do you hear most often?" optional>
        <TextArea
          value={data.commonObjections}
          onChange={(e) => updateData({ commonObjections: e.target.value })}
          placeholder="e.g., Price, timing, need to compare other options..."
          rows={2}
        />
      </FormField>

      <FormField label="Where do you lose most prospects?" optional>
        <TextArea
          value={data.whereProspectsLost}
          onChange={(e) => updateData({ whereProspectsLost: e.target.value })}
          placeholder="e.g., After the quote, during scheduling, no response..."
          rows={2}
        />
      </FormField>

      <FormField label="Do you use online scheduling tools?">
        <YesNoToggle
          value={data.usesOnlineScheduling}
          onChange={(value) => updateData({ usesOnlineScheduling: value })}
        />
      </FormField>

      <FormField label="What is your average time-to-quote?" optional>
        <TextInput
          value={data.avgTimeToQuote}
          onChange={(e) => updateData({ avgTimeToQuote: e.target.value })}
          placeholder="e.g., Same day, 24-48 hours, 3-5 days..."
        />
      </FormField>
    </div>
  );
}
