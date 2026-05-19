import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

const ClientPortal = lazy(() => import("@/pages/ClientPortal"));
const ClientPortalAuth = lazy(() => import("@/pages/ClientPortalAuth"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

const queryClient = new QueryClient();

export function ClientApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/portal" element={<ClientPortal />} />
              <Route path="/portal/auth" element={<ClientPortalAuth />} />
              {/* Root serves ClientPortalAuth so Supabase hash tokens (recovery, invite) aren't stripped by Navigate */}
              <Route path="/" element={<ClientPortalAuth />} />
              <Route path="*" element={<Navigate to="/portal/auth" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
