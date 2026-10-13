// Best-effort client email when their first work cycle is actually planned
// (after onboarding finishes), so "your plan is paid" is followed by a clear
// "and here is what is now happening". Never throws into the caller.
import { send } from "./billingEmail.ts";

const PORTAL_URL = Deno.env.get("CLIENT_PORTAL_URL") || "https://client.orangedoormarketing.com";

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function sendFirstCycleReadyEmail(
  to: string,
  firstName: string | null,
  periodEnd: string,
  scheduledPosts: number,
): Promise<void> {
  const until = new Date(periodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  await send(
    to,
    "Your first Orange Door cycle is planned",
    `<p>Hi ${esc(firstName || "there")},</p>
     <p>Thanks for finishing your setup. Your content and outreach are now planned through ${esc(until)}${
      scheduledPosts > 0 ? `, including ${scheduledPosts} posts waiting for your review` : ""
    }.</p>
     <p>Approve or edit your drafts in the portal, and each month we use your feedback to plan the next cycle.</p>
     <p><a href="${PORTAL_URL}/portal?tab=approvals">Review your drafts</a></p>
     <p>- The Orange Door Team</p>`,
  ).catch((e) => console.error("first-cycle email failed:", e));
}
