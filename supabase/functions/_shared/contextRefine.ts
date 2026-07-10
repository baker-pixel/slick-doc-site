// The feedback channel (blackboard model). Outcomes flow ONE direction: into
// the client's shared context. Agents never trigger each other -- they each
// independently pull this refined context next time they run, so the next
// content/audit/outreach is more on-point without any orchestration.
//
// This writes ONLY to client_accounts.context_profile. It triggers no work.

import { callAIJson, MODELS } from "./ai.ts";

interface RefineResult {
  refined: boolean;
  whats_working: string[];
}

export async function refineClientContext(supabase: any, clientId: string): Promise<RefineResult> {
  const since = new Date(Date.now() - 45 * 86_400_000).toISOString();

  const { data: client } = await supabase
    .from("client_accounts").select("id, business_name, context_profile").eq("id", clientId).maybeSingle();
  if (!client?.context_profile) return { refined: false, whats_working: [] };

  // Gather the signals the reports are built from -- what actually happened.
  const [approved, rejected, conversions, scores] = await Promise.all([
    supabase.from("generated_content").select("title, content_type")
      .eq("client_id", clientId).in("status", ["approved", "client_approved", "published"])
      .gte("updated_at", since).limit(25),
    supabase.from("generated_content").select("title, rejection_reason")
      .eq("client_id", clientId).eq("status", "rejected").not("rejection_reason", "is", null)
      .gte("updated_at", since).limit(15),
    supabase.from("prospects").select("business_type, context_profile")
      .eq("client_id", clientId).eq("status", "converted").limit(10),
    supabase.from("outcome_metrics").select("value, captured_at")
      .eq("client_account_id", clientId).eq("metric", "seo_score")
      .order("captured_at", { ascending: true }).limit(20),
  ]);

  const approvedList = (approved.data ?? []).map((r: any) => r.title).filter(Boolean);
  const rejectedList = (rejected.data ?? []).map((r: any) => `${r.title}: ${r.rejection_reason}`).filter(Boolean);
  const conversionTypes = (conversions.data ?? []).map((c: any) => c.business_type).filter(Boolean);
  const scoreSeries = (scores.data ?? []).map((s: any) => Number(s.value));

  // Nothing new to learn from -> leave context untouched.
  if (approvedList.length === 0 && rejectedList.length === 0 && conversionTypes.length === 0) {
    return { refined: false, whats_working: [] };
  }

  const ctx = client.context_profile as Record<string, unknown>;
  let patch: { whats_working?: string[]; brand_voice_notes?: string; icp_signal?: string };
  try {
    patch = await callAIJson<typeof patch>({
      source: "refine-client-context",
      clientId,
      model: MODELS.default,
      jsonMode: true,
      maxTokens: 500,
      promptId: "context-refine.v1",
      system: `You refine a client's marketing context from what actually performed, so future content/targeting is more on-point. Return ONLY {"whats_working":[3-6 short phrases: themes/angles/topics that resonated],"brand_voice_notes":"one sentence of tone adjustments learned from rejections, or empty","icp_signal":"one sentence on the customer type actually converting, or empty"}. Be concrete and grounded ONLY in the data given -- no invention.`,
      prompt: `Business: ${client.business_name}
Current what's-working: ${Array.isArray(ctx.whats_working) ? (ctx.whats_working as string[]).join("; ") : "none yet"}
Approved/published content titles: ${approvedList.join(" | ") || "none"}
Rejected content (title: reason): ${rejectedList.join(" | ") || "none"}
Business types that converted to customers: ${conversionTypes.join(", ") || "none"}
SEO score trend: ${scoreSeries.join(" → ") || "n/a"}`,
    });
  } catch (e) {
    console.error("refineClientContext AI failed:", e instanceof Error ? e.message : e);
    return { refined: false, whats_working: [] };
  }

  const whats_working = (patch.whats_working ?? []).filter(Boolean).slice(0, 6);
  const merged = {
    ...ctx,
    whats_working,
    ...(patch.brand_voice_notes ? { brand_voice_notes: patch.brand_voice_notes } : {}),
    ...(patch.icp_signal ? { converting_customer_signal: patch.icp_signal } : {}),
    learning_updated_at: new Date().toISOString(),
  };

  await supabase.from("client_accounts").update({ context_profile: merged }).eq("id", clientId);
  return { refined: true, whats_working };
}
