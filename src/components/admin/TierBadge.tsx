import { Badge } from "@/components/ui/badge";

const tierStyles: Record<string, string> = {
  foundation: "bg-muted text-muted-foreground border-border",
  growth: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  transformation: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  scale: "bg-amber-500/10 text-amber-600 border-amber-500/30",
};

export function TierBadge({ tier }: { tier: string | null | undefined }) {
  const t = (tier || "foundation").toLowerCase();
  const label = t.charAt(0).toUpperCase() + t.slice(1);
  const style = tierStyles[t] || tierStyles.foundation;

  return (
    <Badge variant="outline" className={`text-xs ${style}`}>
      {label}
    </Badge>
  );
}
