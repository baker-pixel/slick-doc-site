import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function BackButton() {
  const navigate = useNavigate();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => navigate(-1)}
      className="gap-2 text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft size={16} />
      Back
    </Button>
  );
}
