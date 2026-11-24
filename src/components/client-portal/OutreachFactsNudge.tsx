import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const MIN_FACTS = 3;

interface Props {
  clientAccountId: string;
  /** Open the settings area that holds the Company Context card. */
  onOpen: () => void;
}

/**
 * Outreach emails may only describe the sender from "verified facts". With fewer than three, the
 * emails stay general about the sender, however well they fit the recipient. Say so, where the
 * client is looking at their outreach, and point at the fix.
 */
export function OutreachFactsNudge({ clientAccountId, onOpen }: Props) {
  const [state, setState] = useState<{ facts: number; suggested: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("client_accounts").select("context_profile").eq("id", clientAccountId).maybeSingle();
      if (cancelled) return;
      const cp = (data?.context_profile ?? {}) as { verified_facts?: unknown; website_suggestions?: { verified_facts?: unknown[] } };
      setState({
        facts: Array.isArray(cp.verified_facts) ? cp.verified_facts.length : 0,
        suggested: Array.isArray(cp.website_suggestions?.verified_facts) ? cp.website_suggestions!.verified_facts!.length : 0,
      });
    })();
    return () => { cancelled = true; };
  }, [clientAccountId]);

  if (!state || state.facts >= MIN_FACTS) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
      <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
      <span className="flex-1">
        Your outreach emails will stay general about your business until you add at least {MIN_FACTS} verified facts
        ({state.facts} so far). They are the only things the emails may say you do.
        {state.suggested > 0 ? ` We found ${state.suggested} on your website for you to review.` : ""}
      </span>
      <Button type="button" size="sm" variant="outline" onClick={onOpen}>Add facts</Button>
    </div>
  );
}
