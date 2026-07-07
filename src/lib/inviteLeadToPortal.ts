import { supabase } from "@/integrations/supabase/client";
import { callAdminApi } from "@/lib/admin-api";

export interface InviteLead {
  email: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string;
  industry?: string | null;
  overall_score?: number | null;
  website_url?: string | null;
}

export function tierFromScore(score: number | null | undefined): string {
  if (!score) return "foundation";
  if (score >= 70) return "transformation";
  if (score >= 45) return "growth";
  return "foundation";
}

/**
 * Create (or reuse) a client account for a lead, seed their onboarding
 * workflow, kick off project generation, and send the portal invite.
 *
 * This used to be implemented twice (Admin.tsx's Inbound Leads flow and
 * PipelineDashboard's flow) and had drifted: the Pipeline copy created the
 * client account and sent the invite but never called seed-tier-workflow
 * or generate-client-projects, so a client invited from Pipeline landed in
 * the portal with no onboarding steps and no projects -- silently
 * incomplete compared to the Inbound Leads path. One implementation now.
 */
export async function inviteLeadToPortal(
  lead: InviteLead,
  adminPassword: string,
  tierOverride?: string,
): Promise<{ clientId: string }> {
  // 1. Check if client account exists
  const { data: existing } = await supabase
    .from("client_accounts")
    .select("id")
    .eq("email", lead.email)
    .maybeSingle();

  let clientId: string;
  const tier = tierOverride || tierFromScore(lead.overall_score);

  if (existing) {
    clientId = existing.id;
  } else {
    // 2a. Create client account
    const { data: newClient, error: createErr } = await supabase
      .from("client_accounts")
      .insert({
        business_name: lead.business_name,
        email: lead.email,
        first_name: lead.first_name || null,
        last_name: lead.last_name || null,
        industry: lead.industry || "General",
        website_url: lead.website_url || null,
        status: "active",
        tier,
        plan_tier: tier,
      })
      .select("id")
      .single();
    if (createErr) throw createErr;
    clientId = newClient.id;

    // 2b. Seed workflow + client_onboarding + kick off project generation
    try {
      await supabase.functions.invoke("seed-tier-workflow", {
        body: { client_id: clientId, tier },
      });
    } catch (wfErr) {
      console.error("Failed to seed workflow:", wfErr);
    }

    // Fallback: generate projects from browser in case edge-to-edge call failed
    supabase.functions
      .invoke("generate-client-projects", { body: { clientAccountId: clientId, returnOnly: false } })
      .catch((err: unknown) => console.error("Auto project generation failed:", err));

    // Brand extraction is handled inside seed-tier-workflow (background fetch)
    // -- no separate call here to avoid duplicate assets.
  }

  // 3. Create invitation via admin API
  const { error: invErr } = await callAdminApi(adminPassword, {
    action: "insert",
    table: "client_invitations",
    data: {
      client_account_id: clientId,
      email: lead.email,
      first_name: lead.first_name || null,
      last_name: lead.last_name || null,
      invited_by: "admin",
    },
  });
  if (invErr) throw new Error(invErr);

  // 4. Send invitation email
  try {
    await supabase.functions.invoke("send-client-invite", {
      body: {
        email: lead.email,
        firstName: lead.first_name || "there",
        clientAccountId: clientId,
      },
    });
  } catch (emailErr) {
    console.error("Failed to send invite email:", emailErr);
  }

  return { clientId };
}
