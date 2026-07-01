import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { PageTransition } from "@/components/PageTransition";
import { ScrollToTop } from "@/components/ScrollToTop";
import { ChatWidget } from "@/components/ChatWidget";
import { VoiceNavigation } from "@/components/VoiceNavigation";
import { Loader2 } from "lucide-react";

const Index = lazy(() => import("./pages/Index"));
const GapAnalysis = lazy(() => import("./pages/GapAnalysis"));
const QuickAssessment = lazy(() => import("./pages/QuickAssessment"));
const QuickAnalysis = lazy(() => import("./pages/QuickAnalysis"));
const AboutUs = lazy(() => import("./pages/AboutUs"));
const ScheduleCall = lazy(() => import("./pages/ScheduleCall"));
const Admin = lazy(() => import("./pages/Admin"));
const System = lazy(() => import("./pages/System"));
const Report = lazy(() => import("./pages/Report"));
const Pricing = lazy(() => import("./pages/Pricing"));
const TierFoundation = lazy(() => import("./pages/TierFoundation"));
const TierGrowth = lazy(() => import("./pages/TierGrowth"));
const TierTransformation = lazy(() => import("./pages/TierTransformation"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ARBusinessCard = lazy(() => import("./pages/ARBusinessCard"));
const ARPresentation = lazy(() => import("./pages/ARPresentation"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const EmailPreferences = lazy(() => import("./pages/EmailPreferences"));
const ClientPortal = lazy(() => import("./pages/ClientPortal"));
const ClientPortalAuth = lazy(() => import("./pages/ClientPortalAuth"));
const SocialCallback = lazy(() => import("./pages/SocialCallback"));
const Portfolio = lazy(() => import("./pages/Portfolio"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));

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
        <Route path="/quick-assessment" element={<PageTransition><QuickAssessment /></PageTransition>} />
        <Route path="/quick-analysis" element={<PageTransition><QuickAnalysis /></PageTransition>} />
        <Route path="/about" element={<PageTransition><AboutUs /></PageTransition>} />
        <Route path="/portfolio" element={<PageTransition><Portfolio /></PageTransition>} />
        <Route path="/schedule" element={<PageTransition><ScheduleCall /></PageTransition>} />
        <Route path="/system" element={<PageTransition><System /></PageTransition>} />
        <Route path="/pricing" element={<PageTransition><Pricing /></PageTransition>} />
        <Route path="/pricing/foundation" element={<PageTransition><TierFoundation /></PageTransition>} />
        <Route path="/pricing/growth" element={<PageTransition><TierGrowth /></PageTransition>} />
        <Route path="/pricing/transformation" element={<PageTransition><TierTransformation /></PageTransition>} />
        <Route path="/admin" element={<PageTransition><Admin /></PageTransition>} />
        <Route path="/report/:id" element={<PageTransition><Report /></PageTransition>} />
        <Route path="/ar-card" element={<PageTransition><ARBusinessCard /></PageTransition>} />
        <Route path="/ar-presentation" element={<ARPresentation />} />
        <Route path="/dashboard/:token" element={<PageTransition><Dashboard /></PageTransition>} />
        <Route path="/email-preferences" element={<PageTransition><EmailPreferences /></PageTransition>} />
        <Route path="/portal" element={<PageTransition><ClientPortal /></PageTransition>} />
        <Route path="/portal/auth" element={<PageTransition><ClientPortalAuth /></PageTransition>} />
        <Route path="/portal/social-callback" element={<SocialCallback />} />
        <Route path="/privacy-policy" element={<PageTransition><PrivacyPolicy /></PageTransition>} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
      </Routes>
    </AnimatePresence>
    </Suspense>
  );
}

const App = () => (
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

export default App;
