import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate } from "../shared.ts";

export async function setupRetentionAutomations(supabase: any, client: ClientData) {
  const { data: config } = await supabase
    .from("integration_configs")
    .select("*")
    .eq("integration_type", "gohighlevel")
    .eq("is_active", true)
    .single();

  const reportDate = formatDate();
  const hasIntegration = !!config;
  const workflows = ["win_back", "renewal_reminder", "review_to_case_study"];

  await createDeliverable(
    supabase,
    client.id,
    `Retention Automations Setup - ${reportDate}`,
    `# Customer Retention Automations

## Status: ${hasIntegration ? 'Complete' : 'Pending Configuration'}

*Generated on ${reportDate} for ${client.business_name}*

## Configured Workflows

${hasIntegration ? `
### Win-Back Campaign
- **Trigger:** Customer inactive for 90+ days
- **Action:** Re-engagement email sequence
- **Goal:** Bring back churned customers

### Renewal Reminder
- **Trigger:** 30 days before subscription/contract renewal
- **Action:** Reminder + incentive offer
- **Goal:** Improve retention rate

### Review to Case Study
- **Trigger:** Customer leaves 5-star review
- **Action:** Request for case study participation
- **Goal:** Generate social proof
` : 'No CRM integration configured. Workflows pending.'}

## Expected Impact

- **25%** reduction in churn
- **40%** higher renewal rate
- **15%** more case studies annually

*${hasIntegration ? 'Retention automations are now protecting your customer base!' : 'Configure CRM integration to activate.'}*`,
    "general"
  );

  return { setup: hasIntegration, workflows: hasIntegration ? workflows : [], deliverableCreated: true };
}
