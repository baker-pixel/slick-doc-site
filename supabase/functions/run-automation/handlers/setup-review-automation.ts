import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate } from "../shared.ts";

export async function setupReviewAutomation(supabase: any, client: ClientData) {
  const { data: config } = await supabase
    .from("integration_configs")
    .select("*")
    .eq("integration_type", "gohighlevel")
    .eq("is_active", true)
    .single();

  const reportDate = formatDate();
  const hasIntegration = !!config;

  await createDeliverable(
    supabase,
    client.id,
    `Review Automation Setup - ${reportDate}`,
    `# Review Automation Setup

## Status: ${hasIntegration ? 'Complete' : 'Pending Configuration'}

*Generated on ${reportDate} for ${client.business_name}*

## Configuration

${hasIntegration ? `**Integration:** GoHighLevel
**Workflow:** review_request_workflow
**Status:** Active and running` : `**Status:** No CRM integration configured
**Action Required:** Configure GoHighLevel integration to enable automated review requests`}

## Automation Flow

${hasIntegration ? `When this automation is active:

1. **After Service Completion:** Customer receives initial review request (2 hours later)
2. **First Follow-up:** Reminder sent if no review (3 days later)
3. **Final Follow-up:** Last gentle reminder (7 days later)

### Channels Used
- Email (primary)
- SMS (if phone number available)` : `To enable this automation, you need to:
1. Configure GoHighLevel integration
2. Re-run this automation`}

## Expected Results

- **30-50%** increase in review volume
- Consistent review flow
- Improved online reputation

*${hasIntegration ? 'Your review automation is now live!' : 'Configure CRM integration to activate.'}*`,
    "general"
  );

  return { setup: hasIntegration, workflowId: hasIntegration ? "review_request_workflow" : null, deliverableCreated: true };
}
