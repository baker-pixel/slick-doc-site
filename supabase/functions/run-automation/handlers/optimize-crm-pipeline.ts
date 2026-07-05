import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate, callGroq, parseJsonFromAi } from "../shared.ts";

export async function optimizeCrmPipeline(supabase: any, client: ClientData, inputData?: Record<string, unknown>) {
  const reportDate = formatDate();

  const { data: config } = await supabase
    .from("integration_configs")
    .select("config")
    .eq("integration_type", "gohighlevel")
    .eq("is_active", true)
    .maybeSingle();

  const systemPrompt = `You are a CRM optimization expert specializing in GoHighLevel. Design a conversion-optimized CRM pipeline.
Output valid JSON only.`;

  const userPrompt = `Design an optimized CRM pipeline for ${client.business_name}.
Industry: ${client.industry || "local services"}
Tier: ${client.tier}
Current CRM: GoHighLevel

Return JSON:
{
  "pipeline_name": "...",
  "stages": [
    {
      "name": "...",
      "purpose": "...",
      "entry_criteria": "...",
      "exit_criteria": "...",
      "automation_triggers": ["..."],
      "tasks_for_team": ["..."],
      "average_time_in_stage": "..."
    }
  ],
  "automation_rules": [
    {"trigger": "...", "condition": "...", "action": "..."}
  ],
  "lead_scoring": [
    {"action": "...", "points": 10}
  ],
  "pipeline_kpis": ["KPI 1", "KPI 2"],
  "quick_wins": ["Fix 1", "Fix 2"]
}`;

  const aiContent = await callGroq(userPrompt, systemPrompt, 3000);
  const parsed = parseJsonFromAi(aiContent);

  const markdownDoc = `# CRM Pipeline Optimization – ${client.business_name}

## Status: Complete ✅

*Generated on ${reportDate}*

**CRM Platform:** GoHighLevel
**Integration Status:** ${config ? "✅ Connected" : "⚠️ Not connected – implement manually"}

---

## Optimized Pipeline: ${parsed?.pipeline_name || `${client.business_name} Pipeline`}

${(parsed?.stages || []).map((s: any, i: number) => `
### Stage ${i + 1}: ${s.name}

**Purpose:** ${s.purpose}

| Field | Details |
|-------|---------|
| Entry Criteria | ${s.entry_criteria} |
| Exit Criteria | ${s.exit_criteria} |
| Avg. Time in Stage | ${s.average_time_in_stage} |

**Automation Triggers:**
${(s.automation_triggers || []).map((t: string) => `- ${t}`).join("\n")}

**Team Tasks:**
${(s.tasks_for_team || []).map((t: string) => `- [ ] ${t}`).join("\n")}`).join("\n\n")}

---

## Automation Rules

| Trigger | Condition | Action |
|---------|-----------|--------|
${(parsed?.automation_rules || []).map((r: any) => `| ${r.trigger} | ${r.condition} | ${r.action} |`).join("\n")}

---

## Lead Scoring Matrix

| Action | Points |
|--------|--------|
${(parsed?.lead_scoring || []).map((l: any) => `| ${l.action} | +${l.points} |`).join("\n")}

**Threshold:** 50+ points = Notify sales immediately

---

## Pipeline KPIs

${(parsed?.pipeline_kpis || []).map((k: string) => `- ${k}`).join("\n")}

---

## Quick Wins to Implement First

${(parsed?.quick_wins || []).map((w: string, i: number) => `${i + 1}. ${w}`).join("\n")}

---

## Implementation Steps

- [ ] Create pipeline stages in GoHighLevel
- [ ] Configure automation rules for each trigger
- [ ] Set up lead scoring in CRM
- [ ] Train team on stage criteria
- [ ] Connect form submissions to pipeline entry
- [ ] Set up KPI reporting dashboard

*Pipeline design is ready. ${config ? "GoHighLevel is connected – implement the stages above." : "Configure GoHighLevel integration then implement."}*`;

  await createDeliverable(supabase, client.id, `CRM Pipeline Optimization – ${reportDate}`, markdownDoc, "general");

  return { optimized: true, stages: parsed?.stages?.length || 0, automationRules: parsed?.automation_rules?.length || 0, deliverableCreated: true };
}
