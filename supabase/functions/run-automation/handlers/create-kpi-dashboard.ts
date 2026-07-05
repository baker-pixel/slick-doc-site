import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate } from "../shared.ts";

export async function createKpiDashboard(supabase: any, client: ClientData) {
  const widgetsByLevel: Record<number, string[]> = {
    1: ["traffic_overview", "gbp_calls", "form_submissions", "reviews"],
    2: ["traffic_overview", "gbp_calls", "form_submissions", "reviews", "lead_sources", "email_performance", "ad_performance"],
    3: ["traffic_overview", "gbp_calls", "form_submissions", "reviews", "lead_sources", "email_performance", "ad_performance", "funnel_metrics", "seo_visibility", "retention", "revenue_attribution"],
  };

  const { data: existing } = await supabase
    .from("kpi_dashboards")
    .select("id")
    .eq("client_account_id", client.id)
    .single();

  const reportDate = formatDate();
  const widgets = widgetsByLevel[client.level || 1] || widgetsByLevel[1];

  if (existing) {
    await createDeliverable(
      supabase,
      client.id,
      `KPI Dashboard - ${reportDate}`,
      `# KPI Dashboard Configuration

## Status: Already Exists

*Generated on ${reportDate} for ${client.business_name}*

A KPI dashboard was already configured for this client. No changes were made.

## Current Configuration

**Tier Level:** ${client.level || 1}

Access the dashboard through the client portal to view your marketing metrics.

*No action required.*`,
      "general"
    );
    return { created: false, reason: "Dashboard already exists", deliverableCreated: true };
  }

  await supabase.from("kpi_dashboards").insert({
    client_account_id: client.id,
    config: { widgets },
  });

  const widgetDescriptions: Record<string, string> = {
    traffic_overview: "Website traffic and visitor trends",
    gbp_calls: "Google Business Profile call tracking",
    form_submissions: "Lead form submissions and conversions",
    reviews: "Google review count and rating",
    lead_sources: "Where your leads are coming from",
    email_performance: "Email open rates and click-throughs",
    ad_performance: "Paid advertising ROI and metrics",
    funnel_metrics: "Sales funnel conversion rates",
    seo_visibility: "Search engine ranking positions",
    retention: "Customer retention and repeat business",
    revenue_attribution: "Revenue by marketing channel",
  };

  await createDeliverable(
    supabase,
    client.id,
    `KPI Dashboard Created - ${reportDate}`,
    `# KPI Dashboard Created

## Status: Complete

*Generated on ${reportDate} for ${client.business_name}*

## Dashboard Configuration

**Tier Level:** ${client.level || 1}
**Widgets Enabled:** ${widgets.length}

## Your Dashboard Includes

${widgets.map(w => `- **${w.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}:** ${widgetDescriptions[w] || 'Custom metric tracking'}`).join('\n')}

## How to Access

1. Log in to your client portal
2. Navigate to the Analytics section
3. View your real-time marketing metrics

## What's Next

- Data will populate as marketing activities begin
- Review your dashboard weekly to track progress
- Your team will send monthly reports highlighting key insights

*Your personalized marketing dashboard is ready!*`,
    "general"
  );

  return { created: true, widgets, deliverableCreated: true };
}
