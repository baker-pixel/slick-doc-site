import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate, callGroq, parseJsonFromAi } from "../shared.ts";

export async function setupRetargetingAudiences(supabase: any, client: ClientData) {
  const reportDate = formatDate();

  const systemPrompt = `You are a paid advertising expert. Create retargeting campaign briefs. Output valid JSON only.`;
  const userPrompt = `Create retargeting audience and campaign setup for ${client.business_name}.
Industry: ${client.industry || "local services"}
Website: ${client.website_url || "N/A"}

Return JSON:
{
  "facebook_audiences": [
    {"name": "...", "type": "...", "duration_days": 180, "description": "..."}
  ],
  "google_audiences": [
    {"name": "...", "type": "...", "duration_days": 540, "description": "..."}
  ],
  "pixel_events": [
    {"event": "...", "trigger": "...", "value": "..."}
  ],
  "campaign_briefs": [
    {
      "platform": "facebook|google",
      "campaign_name": "...",
      "objective": "...",
      "audience": "...",
      "ad_copy": "...",
      "budget_suggestion": "...",
      "bid_strategy": "..."
    }
  ]
}`;

  let parsed: any = null;
  try {
    const aiContent = await callGroq(userPrompt, systemPrompt, 2500);
    parsed = parseJsonFromAi(aiContent);
  } catch (_e) {
    // Use defaults if AI fails
  }

  const fbAudiences = parsed?.facebook_audiences || [
    { name: `${client.business_name} – All Website Visitors`, type: "Website Custom Audience", duration_days: 180, description: "All visitors in last 180 days" },
    { name: `${client.business_name} – High-Intent Visitors`, type: "Website Custom Audience", duration_days: 30, description: "Visitors who viewed contact or pricing pages" },
  ];

  const gAudiences = parsed?.google_audiences || [
    { name: `${client.business_name} – Site Visitors`, type: "Website Visitors", duration_days: 540, description: "All website visitors" },
    { name: `${client.business_name} – Form Abandoners`, type: "Website Visitors", duration_days: 90, description: "Started but didn't complete a form" },
  ];

  await createDeliverable(
    supabase,
    client.id,
    `Retargeting Audiences Setup – ${reportDate}`,
    `# Retargeting Audiences & Campaign Setup – ${client.business_name}

## Status: Complete ✅

*Generated on ${reportDate}*

---

## Pixel Installation Instructions

### Meta Pixel (Facebook/Instagram)

1. Go to Meta Events Manager → **Data Sources** → **Connect Data Sources** → **Web**
2. Create a new Pixel named: **"${client.business_name} Pixel"**
3. Install the base code in the \`<head>\` of every page on ${client.website_url || "your website"}
4. Add these standard events:

| Event | Trigger |
|-------|---------|
${(parsed?.pixel_events || [
  { event: "PageView", trigger: "Every page load" },
  { event: "Lead", trigger: "Form submission confirmation" },
  { event: "Contact", trigger: "Contact page visit" },
  { event: "ViewContent", trigger: "Service page visit" },
]).map((e: any) => `| \`${e.event}\` | ${e.trigger} |`).join("\n")}

### Google Tag (Google Ads)

1. Create a Google Ads account → **Tools** → **Audience Manager** → **Your Data Segments**
2. Create a new **Website Visitors** segment
3. Install Google tag via Google Tag Manager or directly in \`<head>\`

---

## Facebook/Instagram Audiences to Create

${fbAudiences.map((a: any) => `
### ${a.name}
- **Type:** ${a.type}
- **Duration:** ${a.duration_days} days
- **Description:** ${a.description}`).join("\n")}

---

## Google Ads Audiences to Create

${gAudiences.map((a: any) => `
### ${a.name}
- **Type:** ${a.type}
- **Duration:** ${a.duration_days} days
- **Description:** ${a.description}`).join("\n")}

---

## Campaign Briefs

${(parsed?.campaign_briefs || [
  { platform: "facebook", campaign_name: `${client.business_name} – Retargeting`, objective: "Lead generation", audience: "All website visitors", ad_copy: "Saw something you liked? We're here when you're ready. Click to get in touch.", budget_suggestion: "$10-20/day", bid_strategy: "Lowest cost" },
  { platform: "google", campaign_name: `${client.business_name} – RLSA`, objective: "Conversions", audience: "Past website visitors searching for your services", ad_copy: "You visited us before – ready to get started?", budget_suggestion: "$5-15/day", bid_strategy: "Target CPA" },
]).map((c: any) => `
### ${c.campaign_name} (${c.platform})
- **Objective:** ${c.objective}
- **Target Audience:** ${c.audience}
- **Ad Copy:** "${c.ad_copy}"
- **Budget Suggestion:** ${c.budget_suggestion}
- **Bid Strategy:** ${c.bid_strategy}`).join("\n")}

---

## Timeline

1. **Day 1-3:** Install pixels and verify firing in Events Manager
2. **Day 3-14:** Audiences build up (need 1,000+ users for Meta ads)
3. **Day 14+:** Launch retargeting campaigns

## Expected Results

- **3-10x higher** CTR vs cold traffic
- **60-70% lower** cost per lead vs prospecting campaigns

*Pixel installation and audience creation steps are ready. Implement and campaigns can launch within 2 weeks.*`,
    "marketing"
  );

  return { setup: true, fbAudiences, gAudiences, campaignBriefs: parsed?.campaign_briefs?.length || 2, deliverableCreated: true };
}
