import { GapAnalysisData } from "../GapAnalysisForm";
import { FormField, TextInput, YesNoToggle } from "../FormField";

interface StepProps {
  data: GapAnalysisData;
  updateData: (updates: Partial<GapAnalysisData>) => void;
}

export function LeadNurtureStep({ data, updateData }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-semibold text-foreground mb-2">
          Lead Capture & Nurture
        </h2>
        <p className="text-muted-foreground">
          How do you follow up with leads and keep them engaged?
        </p>
      </div>

      <FormField label="Do you use email automation?">
        <YesNoToggle
          value={data.usesEmailAutomation}
          onChange={(value) => updateData({ usesEmailAutomation: value })}
        />
      </FormField>

      <FormField label="Do you use SMS follow-ups or reminders?">
        <YesNoToggle
          value={data.usesSmsFollowups}
          onChange={(value) => updateData({ usesSmsFollowups: value })}
        />
      </FormField>

      <FormField label="Do you have a CRM?">
        <YesNoToggle
          value={data.hasCrm}
          onChange={(value) => updateData({ hasCrm: value })}
        />
      </FormField>

      {data.hasCrm && (
        <>
          <FormField label="Which CRM do you use?">
            <TextInput
              value={data.crmName}
              onChange={(e) => updateData({ crmName: e.target.value })}
              placeholder="e.g., HubSpot, Salesforce, ServiceTitan, GoHighLevel..."
            />
          </FormField>

          <FormField label="Is all inbound activity tracked in the CRM?">
            <YesNoToggle
              value={data.crmTracksAllInbound}
              onChange={(value) => updateData({ crmTracksAllInbound: value })}
            />
          </FormField>
        </>
      )}

      <FormField label="Do you have segmentation or drip campaigns?">
        <YesNoToggle
          value={data.hasSegmentationDrip}
          onChange={(value) => updateData({ hasSegmentationDrip: value })}
        />
      </FormField>

      <FormField label="Do you have abandoned-form or abandoned-visit follow-ups?">
        <YesNoToggle
          value={data.hasAbandonedFollowups}
          onChange={(value) => updateData({ hasAbandonedFollowups: value })}
        />
      </FormField>

      <FormField label="What percentage of leads convert to customers?" optional>
        <TextInput
          value={data.leadToCustomerConversionRate}
          onChange={(e) => updateData({ leadToCustomerConversionRate: e.target.value })}
          placeholder="e.g., 10%, 25%, Not sure..."
        />
      </FormField>
    </div>
  );
}
