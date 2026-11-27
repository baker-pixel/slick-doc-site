import { Lightbulb } from "lucide-react";
import type { CycleReview } from "@/hooks/use-cycle-metrics";

/** What the cycle review found and what it is testing. Only rendered for a live review. */
export function ReviewCard({ review }: { review: CycleReview }) {
  if (review.mode !== "live" || (review.findings.length === 0 && review.bets.length === 0)) return null;
  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">What we changed after cycle {review.reviewed_cycle_no}</h3>
      </div>
      {review.findings.length > 0 && (
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
          {review.findings.slice(0, 4).map((f) => <li key={f}>{f}</li>)}
        </ul>
      )}
      {review.bets.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Testing this cycle</p>
          <ul className="mt-2 space-y-2">
            {review.bets.map((b) => (
              <li key={b.id} className="rounded-xl bg-card/80 p-3 text-sm">
                <p className="font-medium">{b.change}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{b.evidence}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
