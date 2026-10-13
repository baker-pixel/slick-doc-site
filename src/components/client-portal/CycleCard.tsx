import { format } from "date-fns";
import { Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useCycles } from "@/hooks/use-cycle";

interface CycleCardProps {
  clientAccountId: string;
}

/**
 * "Your cycle" on the portal home: the paid period the agents have planned
 * for, and what they learned from the last one. Hidden until a cycle exists
 * so a brand-new client doesn't see an empty shell.
 */
export function CycleCard({ clientAccountId }: CycleCardProps) {
  const { data, isLoading } = useCycles(clientAccountId);
  if (isLoading || !data?.current) return null;

  const { current, previous } = data;
  const planning = current.status === "planning";
  const learned = previous?.digest?.learned ?? [];
  const focus = current.plan?.discovery?.focus;

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <RefreshCw className="h-4 w-4 text-primary" />
          <h3 className="text-lg font-semibold">Cycle {current.cycle_no}</h3>
          <Badge variant="secondary">
            {format(new Date(current.period_start), "MMM d")} – {format(new Date(current.period_end), "MMM d")}
          </Badge>
          {planning && (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Planning your content and outreach
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Your posts and outreach for this billing period are planned through {format(new Date(current.period_end), "MMM d")}.
          {focus ? ` This cycle's lead search focus: ${focus}.` : ""}
        </p>
        {learned.length > 0 && (
          <div>
            <p className="text-sm font-medium">What we learned from last cycle</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {learned.slice(0, 5).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
