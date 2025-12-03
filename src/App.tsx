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
import Index from "./pages/Index";
import GapAnalysis from "./pages/GapAnalysis";
import QuickAssessment from "./pages/QuickAssessment";
import QuickAnalysis from "./pages/QuickAnalysis";
import AboutUs from "./pages/AboutUs";
import ScheduleCall from "./pages/ScheduleCall";
import Admin from "./pages/Admin";
import System from "./pages/System";
import Report from "./pages/Report";
import Pricing from "./pages/Pricing";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AnimatedRoutes() {
  const location = useLocation();
  
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageTransition><Index /></PageTransition>} />
        <Route path="/gap-analysis" element={<PageTransition><GapAnalysis /></PageTransition>} />
        <Route path="/quick-assessment" element={<PageTransition><QuickAssessment /></PageTransition>} />
        <Route path="/quick-analysis" element={<PageTransition><QuickAnalysis /></PageTransition>} />
        <Route path="/about" element={<PageTransition><AboutUs /></PageTransition>} />
        <Route path="/schedule" element={<PageTransition><ScheduleCall /></PageTransition>} />
        <Route path="/system" element={<PageTransition><System /></PageTransition>} />
        <Route path="/pricing" element={<PageTransition><Pricing /></PageTransition>} />
        <Route path="/admin" element={<PageTransition><Admin /></PageTransition>} />
        <Route path="/report/:id" element={<PageTransition><Report /></PageTransition>} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
      </Routes>
    </AnimatePresence>
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
