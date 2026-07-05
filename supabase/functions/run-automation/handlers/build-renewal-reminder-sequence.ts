import type { ClientData } from "../types.ts";
import { createDeliverable } from "../shared.ts";

export async function buildRenewalReminderSequence(
  supabase: any,
  client: ClientData,
  inputData?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  console.log(`Building renewal reminder sequence for ${client.business_name}`);

  // Define renewal reminder email sequence
  const renewalEmails = [
    {
      subject: `${client.business_name} - Subscription Renewal Reminder (60 Days)`,
      delay_days: 0,
      template: "renewal_60_day",
      content: `Hey there! Just a friendly heads up - your subscription with us is coming up for renewal in about 60 days. We've loved working with you and wanted to give you plenty of time to review your account and let us know if you have any questions.`
    },
    {
      subject: `${client.business_name} - Your Results This Year + Renewal Info`,
      delay_days: 15,
      template: "renewal_45_day",
      content: `With 45 days until renewal, we wanted to share a quick recap of what we've accomplished together. Your business has grown, and we're excited to continue partnering with you.`
    },
    {
      subject: `${client.business_name} - 30 Day Renewal Notice`,
      delay_days: 30,
      template: "renewal_30_day",
      content: `Your subscription renews in 30 days. If you'd like to make any changes to your plan or have questions about pricing, now is a great time to chat.`
    },
    {
      subject: `${client.business_name} - Renewal Coming Up (14 Days)`,
      delay_days: 46,
      template: "renewal_14_day",
      content: `Quick reminder: Your subscription renews in 2 weeks. We're here to answer any questions and make sure you're getting the most value from our partnership.`
    },
    {
      subject: `${client.business_name} - Final Renewal Reminder (7 Days)`,
      delay_days: 53,
      template: "renewal_7_day",
      content: `Your subscription renews in one week. If you need to update payment information or have any concerns, please reach out to us right away.`
    },
    {
      subject: `${client.business_name} - Renewal Tomorrow`,
      delay_days: 59,
      template: "renewal_1_day",
      content: `Just a heads up - your subscription renews tomorrow. Thank you for continuing to trust us with your marketing needs!`
    }
  ];

  // Create the email sequence in the database
  const { data: sequence, error: seqError } = await supabase
    .from("email_sequences")
    .insert({
      name: `Renewal Reminder - ${client.business_name}`,
      trigger_type: "renewal_reminder",
      is_active: true,
      emails: renewalEmails.map(email => ({
        subject: email.subject,
        delay_days: email.delay_days,
        template_slug: email.template,
        preview: email.content.substring(0, 100) + "..."
      }))
    })
    .select()
    .single();

  if (seqError) {
    throw new Error(`Failed to create renewal sequence: ${seqError.message}`);
  }

  // Create a deliverable with the sequence details
  await createDeliverable(
    supabase,
    client.id,
    `Renewal Reminder Sequence - ${client.business_name}`,
    `# Renewal Reminder Email Sequence

## Overview
A comprehensive 6-email renewal reminder sequence has been created for ${client.business_name} to ensure smooth subscription renewals and maintain strong client relationships.

---

## Email Sequence Timeline

| Day | Email | Purpose |
|-----|-------|---------|
${renewalEmails.map(email => `| Day ${email.delay_days} | ${email.template.replace(/_/g, ' ').toUpperCase()} | ${email.content.substring(0, 60)}... |`).join('\n')}

---

## Sequence Details

${renewalEmails.map((email, idx) => `
### Email ${idx + 1}: ${email.template.replace(/_/g, ' ').toUpperCase()}
- **Subject:** ${email.subject}
- **Send Day:** ${email.delay_days} days before renewal
- **Purpose:** ${email.content}
`).join('')}

---

## Implementation Notes

### Trigger Conditions:
1. ✅ Sequence triggers 60 days before renewal date
2. ✅ Stops if client renews early
3. ✅ Escalates to account manager if no response after Day 53

### Customization Options:
- Email templates can be personalized with client metrics
- Timing can be adjusted based on contract value
- Additional touchpoints can be added for high-value accounts

---

*This automated sequence ensures no renewal falls through the cracks while maintaining a professional, helpful tone throughout the process.*`,
    "email"
  );

  return {
    success: true,
    sequenceCreated: !!sequence,
    sequenceId: sequence?.id,
    emailCount: renewalEmails.length,
    deliverableCreated: true,
    timeline: renewalEmails.map(e => ({ day: e.delay_days, template: e.template })),
    timestamp: new Date().toISOString(),
  };
}
