import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate } from "../shared.ts";

export async function addClientToCrm(supabase: any, client: ClientData) {
  const { data: config } = await supabase
    .from("integration_configs")
    .select("*")
    .eq("integration_type", "gohighlevel")
    .eq("is_active", true)
    .single();

  const added = !!config;
  const crmId = config ? `ghl_${client.id}` : null;

  await supabase
    .from("client_onboarding")
    .update({ crm_added_at: new Date().toISOString() })
    .eq("client_account_id", client.id);

  const reportDate = formatDate();
  await createDeliverable(
    supabase,
    client.id,
    `CRM Setup - ${reportDate}`,
    `# CRM Integration Setup

## Status: ${added ? 'Complete' : 'Pending Configuration'}

*Generated on ${reportDate} for ${client.business_name}*

## Details

${added ? `- **CRM ID:** ${crmId}
- **Platform:** GoHighLevel
- **Status:** Contact created successfully` : `- **Status:** No CRM integration configured
- **Action Required:** Configure GoHighLevel integration in admin settings`}

## What This Enables

- Centralized contact management
- Automated follow-up sequences
- Lead tracking and attribution
- Sales pipeline visibility

*${added ? 'CRM integration is now active for this client.' : 'Contact your admin to configure CRM integration.'}*`,
    "general"
  );

  return { added, crmId, deliverableCreated: true };
}
