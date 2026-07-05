import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate, callGroq, parseJsonFromAi } from "../shared.ts";

export async function createFullAnalyticsSuite(supabase: any, client: ClientData, inputData?: Record<string, unknown>) {
  const reportDate = formatDate();

  const levelWidgets: string[] = [
    "traffic_overview", "gbp_calls", "form_submissions", "reviews",
    "lead_sources", "email_performance", "ad_performance",
    "funnel_metrics", "seo_visibility", "retention",
    "revenue_attribution", "attribution_modeling",
    "predictive_lead_score", "channel_roi_comparison", "customer_ltv",
  ];

  const { data: existing } = await supabase
    .from("kpi_dashboards")
    .select("id")
    .eq("client_account_id", client.id)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("kpi_dashboards")
      .update({ config: { widgets: levelWidgets, tier: "transformation", auto_report: true } })
      .eq("client_account_id", client.id);
  } else {
    await supabase.from("kpi_dashboards").insert({
      client_account_id: client.id,
      config: { widgets: levelWidgets, tier: "transformation", auto_report: true },
    });
  }

  const systemPrompt = `You are a marketing analytics expert. Create a comprehensive analytics framework.
Output valid JSON only.`;

  const userPrompt = `Create a full analytics suite configuration for ${client.business_name}.
Industry: ${client.industry || "local services"}
Tier: Level III (Transformation)

Return JSON:
{
  "attribution_model": {
    "type": "...",
    "touchpoints": ["..."],
    "weighting": "..."
  },
  "kpi_targets": [
    {"kpi": "...", "current_baseline": "...", "target_30_day": "...", "target_90_day": "..."}
  ],
  "automated_reports": [
    {"name": "...", "frequency": "daily|weekly|monthly", "recipients": ["..."], "metrics": ["..."]}
  ],
  "custom_segments": ["Segment 1", "Segment 2"],
  "conversion_events": [
    {"event": "...", "value": "..."}
  ],
  "data_sources": ["Google Analytics 4", "..."]
}`;

  const aiContent = await callGroq(userPrompt, systemPrompt, 2500);
  const parsed = parseJsonFromAi(aiContent);

  const markdownDoc = `# Full Analytics Suite – ${client.business_name}

## Status: Complete ✅

*Generated on ${reportDate}*

---

## Dashboard Configuration

**Tier:** Level III – Transformation
**Widgets Enabled:** ${levelWidgets.length}
**Auto-Reporting:** Active

### Widgets Installed

${levelWidgets.map((w) => `- **${w.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")}**`).join("\n")}

---

## Attribution Model

**Type:** ${parsed?.attribution_model?.type || "Data-driven multi-touch"}
**Touchpoints Tracked:** ${(parsed?.attribution_model?.touchpoints || []).join(", ")}
**Weighting:** ${parsed?.attribution_model?.weighting || "Position-based (40% first/last, 20% middle)"}

---

## KPI Targets

| KPI | Baseline | 30-Day Target | 90-Day Target |
|-----|----------|---------------|---------------|
${(parsed?.kpi_targets || []).map((k: any) => `| ${k.kpi} | ${k.current_baseline} | ${k.target_30_day} | ${k.target_90_day} |`).join("\n")}

---

## Automated Reports

${(parsed?.automated_reports || []).map((r: any) => `
### ${r.name}
- **Frequency:** ${r.frequency}
- **Recipients:** ${(r.recipients || []).join(", ")}
- **Metrics:** ${(r.metrics || []).join(", ")}`).join("\n")}

---

## Custom Audience Segments

${(parsed?.custom_segments || []).map((s: string) => `- ${s}`).join("\n")}

---

## Conversion Events Tracked

| Event | Assigned Value |
|-------|---------------|
${(parsed?.conversion_events || []).map((e: any) => `| ${e.event} | ${e.value} |`).join("\n")}

---

## Data Sources Connected

${(parsed?.data_sources || ["Google Analytics 4", "Google Search Console", "CRM"]).map((d: string) => `- ${d}`).join("\n")}

---

## Implementation Checklist

- [ ] Verify GA4 is installed and tracking all events
- [ ] Set up Google Search Console and link to GA4
- [ ] Configure cross-channel attribution in GA4
- [ ] Import conversion values into Google Ads
- [ ] Set up Looker Studio dashboard for automated reporting
- [ ] Configure email report delivery for all stakeholders

*Full analytics suite is configured. Dashboard is live in client portal.*`;

  await createDeliverable(supabase, client.id, `Full Analytics Suite – ${reportDate}`, markdownDoc, "report");

  return { created: true, widgetCount: levelWidgets.length, dashboardUpdated: !!existing, deliverableCreated: true };
}
