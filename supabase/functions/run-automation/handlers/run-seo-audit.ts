import type { ClientData } from "../types.ts";

// Delegates to the canonical SEO engine (seo-audit): robots-aware crawl,
// PageSpeed, rubric-scored evidence-backed findings. It writes the canonical
// seo_audits shape, upserts the client's SEO Action Plan project, records the
// score outcome, and logs activity. This replaces the old fixed 3-page
// analyze-seo pipeline so every trigger (onboarding workflow, agent tool, SEO
// task aliases) produces one consistent audit.
export async function runSeoAudit(_supabase: any, client: ClientData) {
  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const res = await fetch(`${baseUrl}/functions/v1/seo-audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ clientId: client.id }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(`seo-audit failed: ${data.error ?? `HTTP ${res.status}`}`);
  }

  // The SEO Action Plan project (created by the engine) is the client-facing
  // artifact now, so no separate markdown deliverable is generated here.
  return { completed: true, results: data, deliverableCreated: false };
}
