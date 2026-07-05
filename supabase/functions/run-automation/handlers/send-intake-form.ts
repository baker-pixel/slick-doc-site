import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate } from "../shared.ts";

export async function sendIntakeForm(supabase: any, client: ClientData) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const APP_URL = Deno.env.get("APP_URL") || "https://orangedoormarketing.com";
  const intakeUrl = `${APP_URL}/intake?clientId=${client.id}`;

  if (RESEND_API_KEY) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Orange Door Consultants <hello@orangedoormarketing.com>",
        to: client.email,
        subject: "Welcome to Orange Door – Complete Your Intake Form",
        html: `
          <h2>Welcome to Orange Door Marketing, ${client.first_name || client.business_name}!</h2>
          <p>We're excited to start working with you. To get started, please complete your intake form:</p>
          <p><a href="${intakeUrl}" style="background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Complete Intake Form</a></p>
          <p>This helps us understand your business and goals so we can create the best strategy for you.</p>
          <p>Best regards,<br/>The Orange Door Team</p>
        `,
      }),
    });
  }

  await supabase
    .from("client_onboarding")
    .update({ intake_form_sent_at: new Date().toISOString() })
    .eq("client_account_id", client.id);

  // Create deliverable
  const reportDate = formatDate();
  await createDeliverable(
    supabase,
    client.id,
    `Intake Form Sent - ${reportDate}`,
    `# Intake Form Sent

## Status: Complete

*Generated on ${reportDate} for ${client.business_name}*

## Details

- **Email sent to:** ${client.email}
- **Intake URL:** ${intakeUrl}

## What's Next

The client will receive an email with a link to complete their intake form. Once completed, we'll proceed with:
- CRM setup
- Kickoff call scheduling
- Dashboard configuration

*This task has been automatically completed.*`,
    "general"
  );

  return { intakeUrl, emailSent: !!RESEND_API_KEY, deliverableCreated: true };
}
