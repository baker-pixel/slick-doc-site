import { GapAnalysisData } from "../GapAnalysisForm";
import { FormField, TextInput } from "../FormField";

interface StepProps {
  data: GapAnalysisData;
  updateData: (updates: Partial<GapAnalysisData>) => void;
}

export function ContactInfoStep({ data, updateData }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-semibold text-foreground mb-2">
          Let&apos;s Start With Your Info
        </h2>
        <p className="text-muted-foreground">
          Tell us about yourself and your business so we can prepare your personalized Gap Analysis.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="First Name" required>
          <TextInput
            type="text"
            value={data.firstName}
            onChange={(e) => updateData({ firstName: e.target.value })}
            placeholder="John"
          />
        </FormField>

        <FormField label="Last Name" required>
          <TextInput
            type="text"
            value={data.lastName}
            onChange={(e) => updateData({ lastName: e.target.value })}
            placeholder="Smith"
          />
        </FormField>
      </div>

      <FormField label="Business Name" required>
        <TextInput
          type="text"
          value={data.businessName}
          onChange={(e) => updateData({ businessName: e.target.value })}
          placeholder="Acme Home Services LLC"
        />
      </FormField>

      <FormField label="Email Address" required>
        <TextInput
          type="email"
          value={data.email}
          onChange={(e) => updateData({ email: e.target.value })}
          placeholder="john@yourbusiness.com"
        />
      </FormField>

      <FormField label="Phone Number" optional>
        <TextInput
          type="tel"
          value={data.phone}
          onChange={(e) => updateData({ phone: e.target.value })}
          placeholder="(865) 555-1234"
        />
      </FormField>

      <FormField label="Website URL" optional hint="We'll analyze this as part of your Gap Analysis">
        <TextInput
          type="url"
          value={data.websiteUrl}
          onChange={(e) => updateData({ websiteUrl: e.target.value })}
          placeholder="https://yourbusiness.com"
        />
      </FormField>
    </div>
  );
}
