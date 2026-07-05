import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate } from "../shared.ts";

export async function createReviewQrCode(supabase: any, client: ClientData) {
  const reviewUrl = client.google_review_url;
  const reportDate = formatDate();

  if (!reviewUrl) {
    await createDeliverable(
      supabase,
      client.id,
      `Review QR Code - ${reportDate}`,
      `# Review QR Code Generation

## Status: Pending

*Generated on ${reportDate} for ${client.business_name}*

## Issue

No Google review URL is configured. Please run the "Create Google Review Link" automation first.

## Steps Required

1. Run "Create Google Review Link" automation
2. Then re-run this QR code generation

*This task depends on having a Google review link.*`,
      "general"
    );
    return { created: false, reason: "No review URL configured", deliverableCreated: true };
  }

  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(reviewUrl)}`;

  await supabase
    .from("client_accounts")
    .update({ review_qr_image_url: qrApiUrl })
    .eq("id", client.id);

  await createDeliverable(
    supabase,
    client.id,
    `Review QR Code Created - ${reportDate}`,
    `# Review QR Code Created

## Status: Complete

*Generated on ${reportDate} for ${client.business_name}*

## Your QR Code

**QR Code URL:** ${qrApiUrl}

When customers scan this QR code with their phone, they'll be taken directly to your Google review page.

## Best Uses for Your QR Code

- **Print Materials:** Business cards, flyers, brochures
- **Point of Sale:** Register stands, receipts
- **Physical Locations:** Window stickers, table tents
- **Staff Tools:** Give to staff to show customers

## Implementation Tips

- Print QR code at minimum 1" x 1" size for easy scanning
- Add a brief call-to-action like "Scan to leave us a review!"
- Test the QR code before printing to ensure it works

*Download and print your QR code to start collecting more reviews!*`,
    "general"
  );

  return { created: true, qrUrl: qrApiUrl, deliverableCreated: true };
}
