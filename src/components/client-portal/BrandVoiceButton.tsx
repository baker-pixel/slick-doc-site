import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BrandVoiceButtonProps {
  onClick: () => void;
  label?: string;
  variant?: "outline" | "default" | "secondary" | "ghost";
  size?: "sm" | "default";
}

// One entry point to the Company Context card (verified facts, never-say list,
// brand tone). Rendered from Brand Assets, Social & Accounts and Content
// Approvals so a client who thinks "this doesn't sound like me" finds the fix
// wherever they noticed the problem.
export function BrandVoiceButton({ onClick, label = "Edit brand voice & facts", variant = "outline", size = "sm" }: BrandVoiceButtonProps) {
  return (
    <Button type="button" variant={variant} size={size} onClick={onClick} className="gap-2">
      <Volume2 className="h-4 w-4" />
      {label}
    </Button>
  );
}
