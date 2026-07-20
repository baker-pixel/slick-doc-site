import { supabase } from "@/integrations/supabase/client";
import { callAdminApi } from "@/lib/admin-api";
import { getClientPortalOrigin } from "@/lib/getPortalUrl";

export interface InviteLead {
  email: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string;
  industry?: string | null;
  overall_score?: number | null;
  website_url?: string | null;
  /** gap_analysis_submissions.id, when this lead came from that funnel. */
  lead_id?: string | null;
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
    const { data: createResult, error: createErr } = await callAdminApi<{ data: { id: string } }>(adminPassword, {
      action: "create",
      table: "client_accounts",
      data: {
        business_name: lead.business_name,
        email: lead.email,
        first_name: lead.first_name || null,
        last_name: lead.last_name || null,
        industry: lead.industry || "General",
        website_url: lead.website_url || null,
        status: "active",
        tier,
        plan_tier: tier,
        lead_id: lead.lead_id || null,
      },
    });
    if (createErr) throw new Error(createErr);
    if (!createResult?.data) throw new Error("Client account was not created");
    clientId = createResult.data.id;

    // 2b. Seed workflow + client_onboarding + kick off project generation
    try {
      await supabase.functions.invoke("seed-tier-workflow", {
        body: { client_id: clientId, tier, password: adminPassword },
      });
    } catch (wfErr) {
      console.error("Failed to seed workflow:", wfErr);
    }

    // Fallback: generate projects from browser in case edge-to-edge call failed
    supabase.functions
      .invoke("generate-client-projects", {
        body: { clientAccountId: clientId, returnOnly: false, password: adminPassword },
      })
      .catch((err: unknown) => console.error("Auto project generation failed:", err));

    // Brand extraction is handled inside seed-tier-workflow (background fetch)
    // -- no separate call here to avoid duplicate assets.
  }

  // 3. Create invitation via admin API
  const { data: inviteResult, error: invErr } = await callAdminApi<{ data: { id: string; token: string } }>(
    adminPassword,
    {
      action: "create_invitation",
      data: {
        client_account_id: clientId,
        email: lead.email,
        first_name: lead.first_name || null,
        last_name: lead.last_name || null,
      },
    },
  );
  if (invErr) throw new Error(invErr);
  const invitation = inviteResult?.data;
  if (!invitation) throw new Error("Invitation was not created");

  // 4. Send invitation email
  try {
    await supabase.functions.invoke("send-client-invite", {
      body: {
        invitationId: invitation.id,
        email: lead.email,
        firstName: lead.first_name || "there",
        businessName: lead.business_name,
        token: invitation.token,
        portalOrigin: getClientPortalOrigin(),
        password: adminPassword,
      },
    });
  } catch (emailErr) {
    console.error("Failed to send invite email:", emailErr);
  }

  return { clientId };
}
