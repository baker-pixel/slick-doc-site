import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate } from "../shared.ts";

export async function sendReviewScripts(supabase: any, client: ClientData) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const reportDate = formatDate();

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
        subject: "Your Google Review Toolkit – Orange Door Marketing",
        html: `
          <h2>Your Review Request Toolkit</h2>
          <p>Hi ${client.first_name || client.business_name},</p>
          <p>Getting more Google reviews is one of the fastest ways to boost your local visibility. Here's your toolkit:</p>

          <h3>Your Direct Review Link:</h3>
          <p><a href="${client.google_review_url}">${client.google_review_url}</a></p>

          ${client.review_qr_image_url ? `<h3>Your Review QR Code:</h3><img src="${client.review_qr_image_url}" alt="Review QR Code" />` : ''}

          <h3>Sample Scripts:</h3>
          <p><strong>In-Person:</strong> "We'd love to hear your feedback! If you have a moment, a Google review really helps other customers find us."</p>
          <p><strong>Email:</strong> "Thank you for choosing us! We'd appreciate it if you could share your experience on Google: [link]"</p>
          <p><strong>After Service:</strong> "How was everything today? If you're happy with our service, would you mind leaving us a quick review?"</p>

          <p>Best regards,<br/>The Orange Door Team</p>
        `,
      }),
    });
  }

  await createDeliverable(
    supabase,
    client.id,
    `Review Scripts Delivered - ${reportDate}`,
    `# Review Scripts & Toolkit Delivered

## Status: Complete

*Generated on ${reportDate} for ${client.business_name}*

## What Was Sent

An email containing:
- Direct Google review link
- QR code (if available)
- Ready-to-use scripts for staff

## Review Request Scripts

### In-Person Script
> "We'd love to hear your feedback! If you have a moment, a Google review really helps other customers find us."

### Email/SMS Script
> "Thank you for choosing us! We'd appreciate it if you could share your experience on Google: [link]"

### After Service Script
> "How was everything today? If you're happy with our service, would you mind leaving us a quick review?"

### Follow-up Script (for happy customers)
> "I noticed you seemed really happy with [service]. If you have 30 seconds, a quick Google review would mean so much to us!"

## Tips for Staff

- **Timing is key:** Ask when the customer is happiest (after successful service)
- **Be genuine:** A sincere ask gets better results
- **Make it easy:** Have the QR code ready to show
- **Don't pressure:** One ask is enough

*Train your team on these scripts to maximize review collection!*`,
    "general"
  );

  return { sent: !!RESEND_API_KEY, deliverableCreated: true };
}
