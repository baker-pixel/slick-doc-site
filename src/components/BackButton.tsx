import { ArrowLeft, Home, ChevronRight } from "lucide-react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

const routeNames: Record<string, string> = {
  "/": "Home",
  "/system": "SYSTEM Methodology",
  "/gap-analysis": "Gap Analysis",
  "/quick-assessment": "Quick Assessment",
  "/schedule": "Schedule Call",
  "/pricing": "Pricing",
  "/admin": "Admin Dashboard",
  "/report": "Report",
};

export function BackButton() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const pathSegments = location.pathname.split("/").filter(Boolean);
  
  const getBreadcrumbs = () => {
    const crumbs = [{ path: "/", name: "Home" }];
    
    if (pathSegments.length > 0) {
      let currentPath = "";
      pathSegments.forEach((segment) => {
        currentPath += `/${segment}`;
        // Handle dynamic routes like /report/:id
        const routeName = routeNames[currentPath] || 
          (currentPath.startsWith("/report/") ? "Report" : segment.charAt(0).toUpperCase() + segment.slice(1));
        crumbs.push({ path: currentPath, name: routeName });
      });
    }
    
    return crumbs;
  };
  
  const breadcrumbs = getBreadcrumbs();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="gap-2 text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded-full px-4 transition-all duration-200 hover:scale-105"
        >
          <ArrowLeft size={16} />
          Back
        </Button>
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="gap-2 text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded-full px-4 transition-all duration-200 hover:scale-105"
        >
          <Link to="/">
            <Home size={16} />
            Home
          </Link>
        </Button>
      </div>
      
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
        {breadcrumbs.map((crumb, index) => (
          <div key={crumb.path} className="flex items-center gap-1">
            {index > 0 && (
              <ChevronRight size={14} className="text-muted-foreground/50" />
            )}
            {index === breadcrumbs.length - 1 ? (
              <span className="text-foreground font-medium">{crumb.name}</span>
            ) : (
              <Link
                to={crumb.path}
                className="text-muted-foreground hover:text-primary transition-colors duration-200"
              >
                {crumb.name}
              </Link>
            )}
          </div>
        ))}
      </nav>
    </div>
  );
}
