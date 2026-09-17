import { useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleCardProps {
  icon: ReactNode;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

// Shared shell for the settings cards on the Lead Outreach tab (ICP,
// Company Context, Outreach signature/CTA) so they collapse/expand the
// same way instead of each card inventing its own header interaction.
export function CollapsibleCard({ icon, title, description, defaultOpen = false, children }: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <Card className="border-0 bg-muted/30 overflow-hidden">
        <CollapsibleTrigger asChild>
          <button type="button" className="w-full text-left">
            <CardHeader className="flex flex-row items-center justify-between gap-3 py-4 hover:bg-muted/50 transition-colors">
              <div className="min-w-0 space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  {icon}
                  {title}
                </CardTitle>
                {description && <CardDescription className="text-xs">{description}</CardDescription>}
              </div>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
            </CardHeader>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
