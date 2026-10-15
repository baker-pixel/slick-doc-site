import { Check, Globe, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface WebsiteSuggestion { text: string; evidence: { url: string; quote: string }[] }
export type WebsiteSuggestions = Partial<Record<string, WebsiteSuggestion[]>>;

const LABELS: Record<string, string> = {
  website_summary: "A different website summary",
  industry: "Industry",
  target_audience: "Who you serve",
  services: "Services",
  differentiators: "What sets you apart",
  location: "Places",
  verified_facts: "Facts your website states",
};
const ORDER = ["website_summary", "industry", "target_audience", "services", "differentiators", "location", "verified_facts"];
// Text fields are replaced when accepted; lists get the item added.
const REPLACES = new Set(["website_summary", "industry", "target_audience"]);

interface Props {
  suggestions: WebsiteSuggestions;
  onAccept: (field: string, item: WebsiteSuggestion) => void;
  onDismiss: (field: string, item: WebsiteSuggestion) => void;
}

function host(url: string): string {
  try { return new URL(url).pathname || "/"; } catch { return url; }
}

export default function WebsiteSuggestionsPanel({ suggestions, onAccept, onDismiss }: Props) {
  const fields = ORDER.filter((f) => (suggestions[f]?.length ?? 0) > 0);
  if (!fields.length) return null;
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">We found these on your website</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Each one comes with the page it was taken from. Add what's right, dismiss what isn't. Nothing changes until you press Save.
      </p>
      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f} className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{LABELS[f]}</p>
            <ul className="space-y-1.5">
              {suggestions[f]!.map((item) => (
                <li key={item.text} className="flex items-start gap-2 rounded-md bg-background/70 p-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{item.text}</p>
                    {item.evidence[0] && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        “{item.evidence[0].quote}”{" "}
                        <a href={item.evidence[0].url} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground break-all">{host(item.evidence[0].url)}</a>
                      </p>
                    )}
                  </div>
                  <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1" onClick={() => onAccept(f, item)}>
                    <Check className="h-3.5 w-3.5" /> {REPLACES.has(f) ? "Use this" : "Add"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="shrink-0" aria-label="Dismiss" onClick={() => onDismiss(f, item)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
