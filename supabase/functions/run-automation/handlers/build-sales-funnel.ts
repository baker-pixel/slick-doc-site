import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate, callGroq, parseJsonFromAi } from "../shared.ts";

export async function buildSalesFunnel(supabase: any, client: ClientData, inputData?: Record<string, unknown>) {
  const reportDate = formatDate();

  const systemPrompt = `You are a sales funnel architect. Design a complete customer journey with email sequences.
Output valid JSON only.`;

  const userPrompt = `Design a complete sales funnel for ${client.business_name}.
Industry: ${client.industry || "local services"}
Website: ${client.website_url || "N/A"}
Tier: ${client.tier}

Return JSON:
{
  "funnel_name": "...",
  "stages": [
    {
      "name": "Awareness",
      "goal": "...",
      "traffic_sources": ["..."],
      "content_assets": ["..."],
      "conversion_metric": "..."
    },
    {
      "name": "Interest",
      "goal": "...",
      "nurture_actions": ["..."],
      "conversion_metric": "..."
    },
    {
      "name": "Consideration",
      "goal": "...",
      "trust_builders": ["..."],
      "conversion_metric": "..."
    },
    {
      "name": "Decision",
      "goal": "...",
      "closing_tactics": ["..."],
      "conversion_metric": "..."
    },
    {
      "name": "Retention",
      "goal": "...",
      "retention_actions": ["..."],
      "conversion_metric": "..."
    }
  ],
  "email_sequences": [
    {
      "stage": "...",
      "trigger": "...",
      "emails": [
        {"day": 0, "subject": "...", "purpose": "...", "body_preview": "..."}
      ]
    }
  ],
  "kpis": ["KPI 1", "KPI 2"],
  "tools_needed": ["CRM", "..."]
}`;

  const aiContent = await callGroq(userPrompt, systemPrompt, 4000);
  const parsed = parseJsonFromAi(aiContent);

  for (const seq of parsed?.email_sequences || []) {
    if (seq.emails?.length) {
      await supabase.from("email_sequences").insert({
        name: `Funnel – ${seq.stage} – ${client.business_name}`,
        trigger_type: seq.trigger?.toLowerCase().replace(/\s+/g, "_") || "funnel_stage",
        is_active: true,
        emails: seq.emails.map((e: any) => ({
          delay_days: e.day,
          subject: e.subject,
          template_slug: `funnel_${seq.stage?.toLowerCase()}`,
          preview: e.body_preview,
        })),
      });
    }
  }

  const markdownDoc = `# Complete Sales Funnel – ${client.business_name}

## Status: Built ✅

*Generated on ${reportDate}*

**Funnel Name:** ${parsed?.funnel_name || `${client.business_name} Growth Funnel`}

---

## Funnel Stages

${(parsed?.stages || []).map((s: any) => `
### ${s.name} Stage
**Goal:** ${s.goal}
${s.traffic_sources ? `**Traffic Sources:** ${s.traffic_sources.join(", ")}` : ""}
${s.content_assets ? `**Content Assets:** ${s.content_assets.join(", ")}` : ""}
${s.nurture_actions ? `**Nurture Actions:** ${s.nurture_actions.join(", ")}` : ""}
${s.trust_builders ? `**Trust Builders:** ${s.trust_builders.join(", ")}` : ""}
${s.closing_tactics ? `**Closing Tactics:** ${s.closing_tactics.join(", ")}` : ""}
${s.retention_actions ? `**Retention Actions:** ${s.retention_actions.join(", ")}` : ""}
**Conversion Metric:** ${s.conversion_metric}`).join("\n\n")}

---

## Email Sequences

${(parsed?.email_sequences || []).map((seq: any) => `
### ${seq.stage} Sequence
**Trigger:** ${seq.trigger}

| Day | Subject | Purpose |
|-----|---------|---------|
${(seq.emails || []).map((e: any) => `| Day ${e.day} | ${e.subject} | ${e.purpose} |`).join("\n")}

**Sample Email (Day 0):**
> ${seq.emails?.[0]?.body_preview || ""}
`).join("\n")}

---

## KPIs

${(parsed?.kpis || []).map((k: string) => `- ${k}`).join("\n")}

## Tools Needed

${(parsed?.tools_needed || []).map((t: string) => `- ${t}`).join("\n")}

---

## Implementation Checklist

- [ ] Activate all email sequences in CRM
- [ ] Set up tracking pixels for each funnel stage
- [ ] Configure lead scoring thresholds
- [ ] Connect ads to top-of-funnel stage
- [ ] Set up retargeting audiences for mid-funnel
- [ ] Configure closed-won trigger for retention stage

*Full funnel is mapped and email sequences are created. Ready for CRM activation.*`;

  await createDeliverable(supabase, client.id, `Complete Sales Funnel – ${reportDate}`, markdownDoc, "report");

  return { built: true, stages: parsed?.stages?.length || 0, sequencesCreated: parsed?.email_sequences?.length || 0, deliverableCreated: true };
}
