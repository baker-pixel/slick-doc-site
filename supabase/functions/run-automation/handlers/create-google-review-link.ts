import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate } from "../shared.ts";

export async function createGoogleReviewLink(supabase: any, client: ClientData) {
  const reportDate = formatDate();

  if (!client.google_place_id) {
    await createDeliverable(
      supabase,
      client.id,
      `Google Review Link - ${reportDate}`,
      `# Google Review Link Setup

## Status: Pending Configuration

*Generated on ${reportDate} for ${client.business_name}*

## Issue

No Google Place ID is configured for this client.

## How to Find Your Google Place ID

1. Search for your business on Google Maps
2. Click on your business listing
3. Look at the URL - the Place ID is after "place/"
4. Or use the Google Place ID Finder tool

## Action Required

1. Find your Google Place ID
2. Update the client profile with the Place ID
3. Re-run this automation

*This is required for Google review functionality.*`,
      "general"
    );
    return { created: false, reason: "No Google Place ID configured", deliverableCreated: true };
  }

  const reviewUrl = `https://search.google.com/local/writereview?placeid=${client.google_place_id}`;

  await supabase
    .from("client_accounts")
    .update({ google_review_url: reviewUrl })
    .eq("id", client.id);

  await createDeliverable(
    supabase,
    client.id,
    `Google Review Link Created - ${reportDate}`,
    `# Google Review Link Created

## Status: Complete

*Generated on ${reportDate} for ${client.business_name}*

## Your Direct Review Link

**URL:** ${reviewUrl}

## How to Use This Link

Share this link with customers to make it easy for them to leave a review:
- Add it to thank you emails
- Include in SMS follow-ups
- Put it on receipts or invoices
- Display in your store/office

## Why Reviews Matter

- **90%** of consumers read online reviews before visiting a business
- **72%** of customers will take action only after reading a positive review
- Reviews improve your local SEO ranking

*The QR code for this link can be generated with the next automation step.*`,
    "general"
  );

  return { created: true, reviewUrl, deliverableCreated: true };
}
