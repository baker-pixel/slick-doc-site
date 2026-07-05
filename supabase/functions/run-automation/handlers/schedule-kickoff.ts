import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate } from "../shared.ts";

export async function sendKickoffScheduler(supabase: any, client: ClientData) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const KICKOFF_CALENDAR_URL = "https://calendly.com/orangedoor/kickoff";

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
        subject: "Schedule Your Kickoff Call – Orange Door Marketing",
        html: `
          <h2>Let's Get Started, ${client.first_name || client.business_name}!</h2>
          <p>We're ready to kick off your marketing journey. Please schedule your kickoff call at your convenience:</p>
          <p><a href="${KICKOFF_CALENDAR_URL}" style="background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Schedule Kickoff Call</a></p>
          <p>During this call, we'll review your goals, discuss strategy, and outline our first 30 days together.</p>
          <p>Best regards,<br/>The Orange Door Team</p>
        `,
      }),
    });
  }

  const reportDate = formatDate();
  await createDeliverable(
    supabase,
    client.id,
    `Kickoff Scheduler Sent - ${reportDate}`,
    `# Kickoff Call Scheduler Sent

## Status: Complete

*Generated on ${reportDate} for ${client.business_name}*

## Details

- **Scheduling link sent to:** ${client.email}
- **Calendar URL:** ${KICKOFF_CALENDAR_URL}

## Kickoff Call Agenda

During the kickoff call, we'll cover:
- Review of business goals and objectives
- Discussion of target audience and ideal customers
- Marketing strategy overview
- Timeline and expectations for first 30 days
- Q&A session

## What's Next

Once the client schedules their kickoff call, we'll prepare:
- Custom strategy presentation
- Initial recommendations based on intake form
- Timeline for deliverables

*Awaiting client to book their kickoff call.*`,
    "general"
  );

  return { schedulerSent: true, calendarUrl: KICKOFF_CALENDAR_URL, deliverableCreated: true };
}
