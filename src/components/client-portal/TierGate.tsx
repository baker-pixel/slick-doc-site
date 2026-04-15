import { Lock, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClientTier } from "./ClientPortalSidebar";

const TIER_RANK: Record<ClientTier, number> = {
  foundation: 0,
  growth: 1,
  transformation: 2,
};

const TIER_DISPLAY: Record<ClientTier, string> = {
  foundation: "Foundation",
  growth: "Growth",
  transformation: "Transformation",
};

interface TierGateProps {
  /** The client's current tier */
  clientTier: ClientTier;
  /** Minimum tier required to access the feature */
  requiredTier: ClientTier;
  /** Human-readable feature name shown in the upgrade message */
  featureName: string;
  /** Brief description of what this feature offers */
  featureDescription?: string;
  /** The actual content to render when access is granted */
  children: React.ReactNode;
}

export function TierGate({
  clientTier,
  requiredTier,
  featureName,
  featureDescription,
  children,
}: TierGateProps) {
  const hasAccess = TIER_RANK[clientTier] >= TIER_RANK[requiredTier];

  if (hasAccess) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-6">
      <div className="max-w-md space-y-6">
        {/* Icon */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/80 border border-border/50">
          <Lock className="h-7 w-7 text-muted-foreground/70" />
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {featureName} is a {TIER_DISPLAY[requiredTier]} feature
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {featureDescription ||
              `Upgrade to the ${TIER_DISPLAY[requiredTier]} plan to unlock ${featureName} and other premium features.`}
          </p>
        </div>

        {/* Upgrade CTA */}
        <Button
          variant="default"
          size="lg"
          className="gap-2"
          onClick={() => {
            // Opens a message to their team asking about upgrading
            window.location.hash = ""; // reset
            const subject = encodeURIComponent(`Interested in upgrading to ${TIER_DISPLAY[requiredTier]}`);
            window.open(`mailto:hello@orangedoormarketing.com?subject=${subject}`, "_blank");
          }}
        >
          Ask about upgrading
          <ArrowUpRight className="h-4 w-4" />
        </Button>

        {/* Current plan badge */}
        <p className="text-xs text-muted-foreground/60">
          Your current plan: <span className="font-semibold text-muted-foreground">{TIER_DISPLAY[clientTier]}</span>
        </p>
      </div>
    </div>
  );
}
