import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { PageTransition } from "@/components/PageTransition";
import { ScrollToTop } from "@/components/ScrollToTop";
import { ChatWidget } from "@/components/ChatWidget";
import { VoiceNavigation } from "@/components/VoiceNavigation";
import { Loader2 } from "lucide-react";

const Index = lazy(() => import("@/pages/marketing/Index"));
const GapAnalysis = lazy(() => import("@/pages/marketing/GapAnalysis"));
const QuickAnalysis = lazy(() => import("@/pages/marketing/QuickAnalysis"));
const AboutUs = lazy(() => import("@/pages/marketing/AboutUs"));
const ScheduleCall = lazy(() => import("@/pages/marketing/ScheduleCall"));
const System = lazy(() => import("@/pages/marketing/System"));
const Report = lazy(() => import("@/pages/marketing/Report"));
const QuickReport = lazy(() => import("@/pages/marketing/QuickReport"));
const Pricing = lazy(() => import("@/pages/marketing/Pricing"));
const Signup = lazy(() => import("@/pages/marketing/Signup"));
const TierFoundation = lazy(() => import("@/pages/marketing/TierFoundation"));
const TierGrowth = lazy(() => import("@/pages/marketing/TierGrowth"));
const TierTransformation = lazy(() => import("@/pages/marketing/TierTransformation"));
const NotFound = lazy(() => import("@/pages/marketing/NotFound"));
const ARBusinessCard = lazy(() => import("@/pages/marketing/ARBusinessCard"));
const ARPresentation = lazy(() => import("@/pages/marketing/ARPresentation"));
const Dashboard = lazy(() => import("@/pages/marketing/Dashboard"));
const LegacyReportRedirect = lazy(() => import("@/pages/marketing/LegacyReportRedirect"));
const EmailPreferences = lazy(() => import("@/pages/marketing/EmailPreferences"));
const PrivacyPolicy = lazy(() => import("@/pages/marketing/PrivacyPolicy"));
const TermsOfService = lazy(() => import("@/pages/marketing/TermsOfService"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

const queryClient = new QueryClient();

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <Suspense fallback={<PageLoader />}>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<PageTransition><Index /></PageTransition>} />
          <Route path="/gap-analysis" element={<PageTransition><GapAnalysis /></PageTransition>} />
          <Route path="/quick-analysis" element={<PageTransition><QuickAnalysis /></PageTransition>} />
          <Route path="/about" element={<PageTransition><AboutUs /></PageTransition>} />
          <Route path="/portfolio" element={<Navigate to="/" replace />} />
          <Route path="/schedule" element={<PageTransition><ScheduleCall /></PageTransition>} />
          <Route path="/system" element={<PageTransition><System /></PageTransition>} />
          <Route path="/pricing" element={<PageTransition><Pricing /></PageTransition>} />
          <Route path="/signup" element={<PageTransition><Signup /></PageTransition>} />
          <Route path="/pricing/foundation" element={<PageTransition><TierFoundation /></PageTransition>} />
          <Route path="/pricing/growth" element={<PageTransition><TierGrowth /></PageTransition>} />
          <Route path="/pricing/transformation" element={<PageTransition><TierTransformation /></PageTransition>} />
          <Route path="/report" element={<LegacyReportRedirect />} />
          <Route path="/report/:id" element={<PageTransition><Report /></PageTransition>} />
          <Route path="/quick-report/:token" element={<PageTransition><QuickReport /></PageTransition>} />
          <Route path="/ar-card" element={<PageTransition><ARBusinessCard /></PageTransition>} />
          <Route path="/ar-presentation" element={<ARPresentation />} />
          <Route path="/dashboard/:token" element={<PageTransition><Dashboard /></PageTransition>} />
          <Route path="/email-preferences" element={<PageTransition><EmailPreferences /></PageTransition>} />
          <Route path="/privacy-policy" element={<PageTransition><PrivacyPolicy /></PageTransition>} />
          <Route path="/terms" element={<PageTransition><TermsOfService /></PageTransition>} />
          <Route path="/terms-of-service" element={<PageTransition><TermsOfService /></PageTransition>} />
          <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
        </Routes>
      </AnimatePresence>
    </Suspense>
  );
}

export function MarketingApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
          <AnimatedRoutes />
          <ChatWidget />
          <VoiceNavigation />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
