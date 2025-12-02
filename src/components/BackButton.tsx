import { ArrowLeft, Home } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function BackButton() {
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(-1)}
        className="gap-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={16} />
        Back
      </Button>
      <Button
        variant="ghost"
        size="sm"
        asChild
        className="gap-2 text-muted-foreground hover:text-foreground"
      >
        <Link to="/">
          <Home size={16} />
          Home
        </Link>
      </Button>
    </div>
  );
}
