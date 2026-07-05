import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate, callGroq, parseJsonFromAi } from "../shared.ts";

export async function runAdvancedSeo(supabase: any, client: ClientData, inputData?: Record<string, unknown>) {
  const reportDate = formatDate();

  const { data: competitors } = await supabase
    .from("client_competitors")
    .select("name, domain")
    .eq("client_account_id", client.id)
    .limit(5);

  const systemPrompt = `You are an enterprise SEO strategist. Create a comprehensive SEO program.
Output valid JSON only.`;

  const userPrompt = `Create an advanced SEO program for ${client.business_name}.
Industry: ${client.industry || "local services"}
Website: ${client.website_url || "N/A"}
Competitors: ${competitors?.map((c: any) => c.name).join(", ") || "not specified"}

Return JSON:
{
  "keyword_clusters": [
    {
      "cluster_name": "...",
      "primary_keyword": "...",
      "secondary_keywords": ["...", "..."],
      "monthly_search_volume": "high|medium|low",
      "difficulty": "high|medium|low",
      "content_type": "service page|blog|FAQ",
      "priority": "immediate|q2|q3"
    }
  ],
  "technical_priorities": [
    {"issue": "...", "impact": "high|medium|low", "fix": "..."}
  ],
  "link_building_strategy": ["tactic 1", "tactic 2"],
  "content_calendar_90_days": [
    {"week": 1, "title": "...", "type": "blog|page|update", "target_keyword": "..."}
  ],
  "local_seo_actions": ["action 1", "action 2"],
  "competitor_gap_opportunities": ["opportunity 1", "opportunity 2"],
  "monthly_kpis": ["KPI 1", "KPI 2"]
}`;

  const aiContent = await callGroq(userPrompt, systemPrompt, 3500);
  const parsed = parseJsonFromAi(aiContent);

  if (parsed?.keyword_clusters) {
    await supabase.from("keyword_gap_results").insert({
      client_account_id: client.id,
      competitors: competitors?.map((c: any) => c.domain) || [],
      results: { keyword_clusters: parsed.keyword_clusters, advanced_program: true },
    });
  }

  const markdownDoc = `# Advanced SEO Program – ${client.business_name}

## Status: Complete ✅

*Generated on ${reportDate}*

---

## Keyword Cluster Strategy

${(parsed?.keyword_clusters || []).map((cluster: any) => `
### ${cluster.cluster_name}
- **Primary Keyword:** ${cluster.primary_keyword}
- **Secondary Keywords:** ${(cluster.secondary_keywords || []).join(", ")}
- **Search Volume:** ${cluster.monthly_search_volume}
- **Difficulty:** ${cluster.difficulty}
- **Content Type:** ${cluster.content_type}
- **Priority:** ${cluster.priority}`).join("\n")}

---

## Technical SEO Priorities

| Issue | Impact | Fix |
|-------|--------|-----|
${(parsed?.technical_priorities || []).map((t: any) => `| ${t.issue} | ${t.impact} | ${t.fix} |`).join("\n")}

---

## Link Building Strategy
${(parsed?.link_building_strategy || []).map((t: string) => `- ${t}`).join("\n")}

---

## 90-Day Content Calendar

| Week | Title | Type | Target Keyword |
|------|-------|------|----------------|
${(parsed?.content_calendar_90_days || []).map((c: any) => `| Week ${c.week} | ${c.title} | ${c.type} | ${c.target_keyword} |`).join("\n")}

---

## Local SEO Actions
${(parsed?.local_seo_actions || []).map((a: string) => `- ${a}`).join("\n")}

---

## Competitor Gap Opportunities
${(parsed?.competitor_gap_opportunities || []).map((o: string) => `- ${o}`).join("\n")}

---

## Monthly KPIs to Track
${(parsed?.monthly_kpis || []).map((k: string) => `- ${k}`).join("\n")}

---

*This advanced SEO program is reviewed and adjusted monthly based on ranking data.*`;

  await createDeliverable(supabase, client.id, `Advanced SEO Program – ${reportDate}`, markdownDoc, "report");

  return { completed: true, clusterCount: parsed?.keyword_clusters?.length || 0, deliverableCreated: true };
}
