import { cn } from "@/lib/utils";

export const RANGES = [7, 28, 90] as const;
export type Range = (typeof RANGES)[number];

export function RangeToggle({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div role="radiogroup" aria-label="Date range" className="inline-flex rounded-xl border border-border/60 bg-muted/40 p-1">
      {RANGES.map((r) => (
        <button
          key={r}
          role="radio"
          aria-checked={value === r}
          onClick={() => onChange(r)}
          className={cn(
            "px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors",
            value === r ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {r}d
        </button>
      ))}
    </div>
  );
}
