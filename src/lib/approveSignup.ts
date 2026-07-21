import { supabase } from "@/integrations/supabase/client";
import { callAdminApi } from "@/lib/admin-api";
import { inviteLeadToPortal } from "@/lib/inviteLeadToPortal";

export interface PendingSignup {
  id: string;
  email: string;
  business_name: string;
  first_name: string | null;
  last_name: string | null;
  website_url: string | null;
  tier: string;
}

/**
 * Approves a self-serve signup (status='pending'): flips it active, seeds the
 * onboarding workflow (skipped at signup time on purpose -- see signup edge
 * function), then reuses inviteLeadToPortal's existing-account branch to
 * create + send the portal invite. The client_accounts row already exists,
 * so inviteLeadToPortal skips its creation path entirely.
 */
export async function approveSignup(
  signup: PendingSignup,
  adminPassword: string,
): Promise<{ clientId: string }> {
  const { error: updateErr } = await callAdminApi(adminPassword, {
    action: "update",
    table: "client_accounts",
    id: signup.id,
    data: { status: "active" },
  });
  if (updateErr) throw new Error(updateErr);

  try {
    await supabase.functions.invoke("seed-tier-workflow", {
      body: { client_id: signup.id, tier: signup.tier, password: adminPassword },
    });
  } catch (err) {
    console.error("Failed to seed workflow for approved signup:", err);
  }

  return inviteLeadToPortal(
    {
      email: signup.email,
      first_name: signup.first_name,
      last_name: signup.last_name,
      business_name: signup.business_name,
      website_url: signup.website_url,
    },
    adminPassword,
    signup.tier,
  );
}
