import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate, callGroq, parseJsonFromAi } from "../shared.ts";

export async function setupSalesEnablement(supabase: any, client: ClientData, inputData?: Record<string, unknown>) {
  const reportDate = formatDate();

  const systemPrompt = `You are a sales enablement expert. Create comprehensive sales materials for a local service business.
Output valid JSON only.`;

  const userPrompt = `Create a complete sales enablement system for ${client.business_name}.
Industry: ${client.industry || "local services"}
Tone: ${client.tone || "professional"}

Return JSON:
{
  "proposal_template": {
    "sections": ["Executive Summary", "Problem Statement", "Our Solution", "Why Us", "Investment", "Next Steps"],
    "executive_summary_template": "...",
    "why_us_points": ["point 1", "point 2", "point 3"]
  },
  "objection_handling": [
    {"objection": "...", "response": "..."}
  ],
  "case_study_template": {
    "sections": ["Client Background", "Challenge", "Solution", "Results", "Testimonial"],
    "results_format": "..."
  },
  "sales_scripts": [
    {"scenario": "Cold outreach", "script": "..."},
    {"scenario": "Discovery call opening", "script": "..."},
    {"scenario": "Handling 'I need to think about it'", "script": "..."},
    {"scenario": "Closing", "script": "..."}
  ],
  "follow_up_cadence": [
    {"day": 1, "channel": "email", "message": "..."},
    {"day": 3, "channel": "phone", "message": "..."},
    {"day": 7, "channel": "email", "message": "..."}
  ]
}`;

  const aiContent = await callGroq(userPrompt, systemPrompt, 3500);
  const parsed = parseJsonFromAi(aiContent);

  await supabase.from("generated_content").insert({
    client_id: client.id,
    content_type: "sales_enablement",
    title: `Sales Enablement System – ${client.business_name}`,
    content: JSON.stringify(parsed),
    metadata: { type: "sales_enablement" },
  });

  const markdownDoc = `# Sales Enablement System – ${client.business_name}

## Status: Complete ✅

*Generated on ${reportDate}*

---

## Proposal Template

**Sections to Include:**
${(parsed?.proposal_template?.sections || []).map((s: string) => `- ${s}`).join("\n")}

**Executive Summary Template:**
> ${parsed?.proposal_template?.executive_summary_template || ""}

**Why Choose Us – Key Points:**
${(parsed?.proposal_template?.why_us_points || []).map((p: string) => `- ${p}`).join("\n")}

---

## Objection Handling Guide

${(parsed?.objection_handling || []).map((o: any) => `
**Objection:** "${o.objection}"

**Response:** ${o.response}`).join("\n\n")}

---

## Case Study Template

**Sections:**
${(parsed?.case_study_template?.sections || []).map((s: string) => `- ${s}`).join("\n")}

**Results Format:**
${parsed?.case_study_template?.results_format || "Before/After with specific metrics (% increase, $ saved, time saved)"}

---

## Sales Scripts

${(parsed?.sales_scripts || []).map((s: any) => `
### ${s.scenario}

> ${s.script}`).join("\n\n")}

---

## Follow-Up Cadence After Proposal

| Day | Channel | Message |
|-----|---------|---------|
${(parsed?.follow_up_cadence || []).map((f: any) => `| Day ${f.day} | ${f.channel} | ${f.message} |`).join("\n")}

---

## Implementation Checklist

- [ ] Load proposal template into CRM document builder
- [ ] Add objection handling guide to sales team resources
- [ ] Create first case study using template
- [ ] Train team on sales scripts
- [ ] Set up automated follow-up cadence in CRM

*All sales materials are ready for team use.*`;

  await createDeliverable(supabase, client.id, `Sales Enablement System – ${reportDate}`, markdownDoc, "content");

  return { created: true, objectionsHandled: parsed?.objection_handling?.length || 0, scriptsCreated: parsed?.sales_scripts?.length || 0, deliverableCreated: true };
}
