import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  X, 
  ChevronRight, 
  ChevronLeft, 
  Users, 
  Mail, 
  FileText, 
  BarChart3,
  Target,
  Settings,
  CheckCircle2,
  Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { AdminSection } from "@/components/admin/core/AdminSidebar";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  details: string[];
  tip: string;
  targetSection?: AdminSection;
}

const onboardingSteps: OnboardingStep[] = [
  {
    id: "overview",
    title: "Welcome to Your Admin Dashboard",
    description: "This is your command center for managing leads, clients, and marketing automation.",
    icon: <Sparkles className="w-8 h-8 text-primary" />,
    details: [
      "View key metrics at a glance on the Overview page",
      "Track submissions, gap analyses, and PDF downloads",
      "Monitor your pipeline performance in real-time"
    ],
    tip: "Start each day by checking the Overview to see new submissions.",
    targetSection: "home"
  },
  {
    id: "leads",
    title: "Managing Your Leads",
    description: "All contact form submissions and PDF lead captures appear here.",
    icon: <Users className="w-8 h-8 text-blue-500" />,
    details: [
      "Contact Submissions: People who filled out your contact form",
      "PDF Leads: Users who downloaded your marketing materials",
      "Click any lead to view their full details and history"
    ],
    tip: "Follow up with new leads within 24 hours for best conversion rates.",
    targetSection: "contacts"
  },
  {
    id: "gap-analysis",
    title: "Gap Analysis Reports",
    description: "Deep-dive assessments of potential clients' marketing needs.",
    icon: <Target className="w-8 h-8 text-orange-500" />,
    details: [
      "View completed gap analysis submissions",
      "Each report includes AI-powered insights and recommendations",
      "Use the scorecard to identify quick wins for prospects"
    ],
    tip: "Reference the gap analysis during sales calls to show personalized value.",
    targetSection: "gap-analysis"
  },
  {
    id: "email",
    title: "Email Marketing Hub",
    description: "Manage templates, sequences, and track email performance.",
    icon: <Mail className="w-8 h-8 text-green-500" />,
    details: [
      "Templates: Create reusable email designs",
      "Sequences: Set up automated follow-up campaigns",
      "Analytics: Track opens, clicks, and conversions"
    ],
    tip: "Set up a welcome sequence to automatically nurture new leads.",
    targetSection: "templates"
  },
  {
    id: "content",
    title: "Content & Calendar",
    description: "Plan and schedule your marketing content.",
    icon: <FileText className="w-8 h-8 text-purple-500" />,
    details: [
      "Content Calendar: Schedule posts and campaigns",
      "Content Review: Approve AI-generated content",
      "Pipeline: Track content from draft to published"
    ],
    tip: "Batch your content creation for efficiency - plan a week at a time.",
    targetSection: "social-posts"
  },
  {
    id: "analytics",
    title: "Reports & Analytics",
    description: "Measure performance and generate client reports.",
    icon: <BarChart3 className="w-8 h-8 text-cyan-500" />,
    details: [
      "View email deliverability and engagement metrics",
      "Generate client performance reports",
      "Track automation job success rates"
    ],
    tip: "Review analytics weekly to identify trends and optimization opportunities.",
    targetSection: "reports-review"
  },
  {
    id: "advanced",
    title: "Advanced Features",
    description: "Power tools for scaling your operations.",
    icon: <Settings className="w-8 h-8 text-gray-500" />,
    details: [
      "Client Management: Manage client accounts and tiers",
      "SOP Documents: Store standard operating procedures",
      "Automation Jobs: Monitor automated tasks and alerts"
    ],
    tip: "Document your processes in SOPs to maintain consistency as you scale.",
    targetSection: "clients"
  }
];

interface AdminOnboardingProps {
  onComplete: () => void;
  onNavigate?: (section: AdminSection) => void;
}

export function AdminOnboarding({ onComplete, onNavigate }: AdminOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  const step = onboardingSteps[currentStep];
  const isLastStep = currentStep === onboardingSteps.length - 1;
  const isFirstStep = currentStep === 0;

  const handleNext = () => {
    setCompletedSteps(prev => new Set(prev).add(step.id));
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (!isFirstStep) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleTryIt = () => {
    if (step.targetSection && onNavigate) {
      onNavigate(step.targetSection);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <Card className="w-full max-w-2xl shadow-2xl border-2">
        <CardHeader className="relative pb-4">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4"
            onClick={handleSkip}
          >
            <X className="w-4 h-4" />
          </Button>
          
          {/* Progress indicator */}
          <div className="flex gap-1 mb-4">
            {onboardingSteps.map((s, i) => (
              <div
                key={s.id}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i < currentStep 
                    ? "bg-primary" 
                    : i === currentStep 
                      ? "bg-primary/60" 
                      : "bg-muted"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-muted">
              {step.icon}
            </div>
            <div>
              <Badge variant="outline" className="mb-2">
                Step {currentStep + 1} of {onboardingSteps.length}
              </Badge>
              <CardTitle className="text-xl">{step.title}</CardTitle>
            </div>
          </div>
          <CardDescription className="mt-2 text-base">
            {step.description}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Details list */}
              <div className="space-y-3">
                {step.details.map((detail, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                    <p className="text-sm text-muted-foreground">{detail}</p>
                  </div>
                ))}
              </div>

              {/* Pro tip */}
              <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/10">
                <p className="text-sm">
                  <span className="font-semibold text-primary">Pro tip: </span>
                  <span className="text-muted-foreground">{step.tip}</span>
                </p>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Navigation buttons */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="ghost"
              onClick={handlePrevious}
              disabled={isFirstStep}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>

            <div className="flex gap-2">
              {step.targetSection && (
                <Button variant="outline" onClick={handleTryIt}>
                  Try it now
                </Button>
              )}
              <Button onClick={handleNext}>
                {isLastStep ? (
                  <>
                    Get Started
                    <Sparkles className="w-4 h-4 ml-1" />
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
