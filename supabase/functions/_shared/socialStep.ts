// deno-lint-ignore-file no-explicit-any
// Onboarding step "Connect Social Accounts" (task_type client_oauth).
//
// ONE connected account is enough to move on. Completing this step used to
// happen only in the client's browser, on a window-focus check right after the
// connect popup closed; if that check missed (another tab, a slow account sync,
// the page closed) the step stayed pending forever and the rest of onboarding
// never unlocked (Cofluence connected Instagram on Nov 16 and sat on step 4).
// This runs server-side whenever accounts sync and in the stalled-workflow
// sweep, so a connected account always advances the checklist.

import { unlockReadySteps } from "./workflowUnlock.ts";

export interface ConnectedAccount {
  platform: string;
  is_primary: boolean | null;
}

/**
 * True when at least one platform has an account we can publish to without the
 * client choosing: exactly one account on that platform, or an explicit primary.
 * A platform with several pages and no pick is ambiguous -- the portal still
 * shows its page picker, and picking completes the step -- so it alone does not count.
 */
export function hasUsableAccount(accounts: ConnectedAccount[]): boolean {
  const byPlatform = new Map<string, ConnectedAccount[]>();
  for (const a of accounts) byPlatform.set(a.platform, [...(byPlatform.get(a.platform) ?? []), a]);
  for (const list of byPlatform.values()) {
    if (list.length === 1 || list.some((a) => a.is_primary)) return true;
  }
  return false;
}

/** Completes the client's pending client_oauth step if an account is connected, then unlocks what follows. */
export async function completeSocialStepIfConnected(supabase: any, clientId: string): Promise<boolean> {
  const { data: wf } = await supabase
    .from("client_workflows").select("id").eq("client_id", clientId).eq("status", "active").maybeSingle();
  if (!wf) return false;

  const { data: pending } = await supabase
    .from("workflow_steps").select("id, step_number")
    .eq("workflow_id", wf.id).eq("task_type", "client_oauth").eq("status", "pending").maybeSingle();
  if (!pending) return false;

  const { data: accounts } = await supabase
    .from("client_postforme_accounts").select("platform, is_primary")
    .eq("client_id", clientId).eq("status", "connected");
  if (!hasUsableAccount((accounts ?? []) as ConnectedAccount[])) return false;

  // Guarded on status so a concurrent browser completion can't double-fire.
  const { data: done } = await supabase
    .from("workflow_steps")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", pending.id).eq("status", "pending").select("id").maybeSingle();
  if (!done) return false;

  await unlockReadySteps(supabase, wf.id, pending.step_number, clientId);
  return true;
}
