import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate } from "../shared.ts";

export async function scheduleStrategyCall(supabase: any, client: ClientData, inputData?: Record<string, unknown>) {
  const reportDate = formatDate();
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const STRATEGY_CALENDAR_URL = "https://calendly.com/orangedoor/strategy";

  const { data: recentReport } = await supabase
    .from("client_reports")
    .select("metrics, insights, recommendations")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const agendaItems = [
    "Review last month's performance metrics",
    "Discuss wins and areas for improvement",
    "Align on next month's priorities",
    "Review any upcoming campaigns or promotions",
    "Q&A / open discussion",
  ];

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
        subject: `Your Monthly Strategy Call – ${client.business_name}`,
        html: `
          <h2>Time for Your Monthly Strategy Call, ${client.first_name || client.business_name}!</h2>
          <p>Your monthly strategy session is ready to book. This is our time to review performance, align on priorities, and make sure your marketing is hitting your business goals.</p>

          <p><a href="${STRATEGY_CALENDAR_URL}" style="background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 16px 0;">Book Your Strategy Call</a></p>

          <h3>Agenda:</h3>
          <ul>
            ${agendaItems.map((item) => `<li>${item}</li>`).join("")}
          </ul>

          ${recentReport?.insights?.length ? `<h3>We'll Cover These Insights:</h3><ul>${recentReport.insights.slice(0, 3).map((i: string) => `<li>${i}</li>`).join("")}</ul>` : ""}

          <p>These calls typically run 30-45 minutes. Come with any questions or topics you'd like to discuss.</p>

          <p>Best regards,<br/>The Orange Door Team</p>
        `,
      }),
    });
  }

  await createDeliverable(
    supabase,
    client.id,
    `Monthly Strategy Call Scheduled – ${reportDate}`,
    `# Monthly Strategy Call – ${client.business_name}

## Status: Invite Sent ✅

*Generated on ${reportDate}*

## Scheduling Link

**Calendar URL:** ${STRATEGY_CALENDAR_URL}

## Call Agenda

${agendaItems.map((item, i) => `${i + 1}. ${item}`).join("\n")}

${recentReport ? `## Performance Context for This Call

### Recent Insights
${(recentReport.insights || []).slice(0, 5).map((i: string) => `- ${i}`).join("\n")}

### Top Recommendations to Discuss
${(recentReport.recommendations || []).slice(0, 3).map((r: any) => `- [${r.priority?.toUpperCase() || ""}] ${r.action}`).join("\n")}` : ""}

## Prep Notes for Account Manager

- Pull latest KPI dashboard before the call
- Prepare top 3 wins from last month
- Have next month's content calendar ready
- Flag any budget or campaign changes to discuss

*Client has been emailed with scheduling link.*`,
    "general"
  );

  return { inviteSent: !!RESEND_API_KEY, calendarUrl: STRATEGY_CALENDAR_URL, deliverableCreated: true };
}
