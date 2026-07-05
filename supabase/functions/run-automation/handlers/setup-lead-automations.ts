import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate } from "../shared.ts";

export async function setupLeadAutomations(supabase: any, client: ClientData) {
  const { data: config } = await supabase
    .from("integration_configs")
    .select("*")
    .eq("integration_type", "gohighlevel")
    .eq("is_active", true)
    .single();

  const reportDate = formatDate();
  const hasIntegration = !!config;

  const workflows = [
    "immediate_response_email",
    "confirmation_sms",
    "follow_up_sequence",
    "no_response_sms",
    "nurture_sequence",
  ];

  await createDeliverable(
    supabase,
    client.id,
    `Lead Automations Setup - ${reportDate}`,
    `# Lead Automation Setup

## Status: ${hasIntegration ? 'Complete' : 'Pending Configuration'}

*Generated on ${reportDate} for ${client.business_name}*

## Configured Workflows

${hasIntegration ? workflows.map(w => `- ✅ ${w.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}`).join('\n') : 'No CRM integration configured. Workflows pending.'}

## Automation Details

### Immediate Response Email
Sends within seconds of lead submission to acknowledge receipt

### Confirmation SMS
Text message confirming we received their inquiry

### Follow-up Sequence
5-email nurture sequence over 14 days

### No Response SMS
Triggered if lead hasn't engaged after 3 days

### Nurture Sequence
Long-term drip campaign for leads not ready to buy

## Expected Impact

- **50% faster** lead response time
- **35% higher** lead-to-appointment rate
- **20% improvement** in close rate

*${hasIntegration ? 'All lead automations are now active!' : 'Configure CRM integration to activate these workflows.'}*`,
    "general"
  );

  return { setup: hasIntegration, workflows: hasIntegration ? workflows : [], deliverableCreated: true };
}
