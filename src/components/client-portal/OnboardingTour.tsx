import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  X, 
  ArrowRight, 
  ArrowLeft,
  Activity,
  Bell,
  LayoutDashboard,
  MessageCircle,
  FileCheck,
  BarChart3,
  HelpCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PortalTab } from "./ClientPortalSidebar";

interface TourStep {
  id: string;
  tab: PortalTab;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tourSteps: TourStep[] = [
  {
    id: "activity",
    tab: "activity",
    title: "Activity Feed",
    description: "This is your home base. See all recent activity on your account at a glance - new messages, completed tasks, and important updates.",
    icon: Activity,
  },
  {
    id: "notifications",
    tab: "notifications",
    title: "Wins & Updates",
    description: "Celebrate your marketing wins here! We'll notify you when campaigns perform well, milestones are reached, and results come in.",
    icon: Bell,
  },
  {
    id: "projects",
    tab: "projects",
    title: "Your Projects",
    description: "Track all your active projects, see progress percentages, and monitor upcoming milestones and deadlines.",
    icon: LayoutDashboard,
  },
  {
    id: "messages",
    tab: "messages",
    title: "Messages",
    description: "Communicate directly with your marketing team. Ask questions, share feedback, or discuss strategy - all in one place.",
    icon: MessageCircle,
  },
  {
    id: "approvals",
    tab: "approvals",
    title: "Content Approvals",
    description: "Review and approve marketing content before it goes live. Provide feedback or request revisions with a single click.",
    icon: FileCheck,
  },
  {
    id: "analytics",
    tab: "analytics",
    title: "Analytics & Results",
    description: "See how your marketing is performing. Access reports, metrics, and insights that show real business results.",
    icon: BarChart3,
  },
  {
    id: "help",
    tab: "help",
    title: "Need Help?",
    description: "You can always come back to this Help section to revisit the tour or learn more about using your portal.",
    icon: HelpCircle,
  },
];

interface OnboardingTourProps {
  active: boolean;
  onClose: () => void;
  onTabChange: (tab: PortalTab) => void;
  currentTab: PortalTab;
}

export function OnboardingTour({ active, onClose, onTabChange, currentTab }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (active && tourSteps[currentStep]) {
      onTabChange(tourSteps[currentStep].tab);
    }
  }, [currentStep, active, onTabChange]);

  if (!active) return null;

  const step = tourSteps[currentStep];
  const isLastStep = currentStep === tourSteps.length - 1;
  const isFirstStep = currentStep === 0;

  const handleNext = () => {
    if (isLastStep) {
      onClose();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (!isFirstStep) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40" onClick={handleSkip} />
      
      {/* Tour Card */}
      <Card className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md p-0 overflow-hidden border-0 shadow-2xl shadow-primary/10">
        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <div 
            className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-300"
            style={{ width: `${((currentStep + 1) / tourSteps.length) * 100}%` }}
          />
        </div>

        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg">
                <step.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">
                  Step {currentStep + 1} of {tourSteps.length}
                </p>
                <h3 className="font-bold text-lg">{step.title}</h3>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleSkip} className="h-8 w-8 -mr-2 -mt-1">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
            {step.description}
          </p>

          {/* Step indicators */}
          <div className="flex justify-center gap-1.5 mb-5">
            {tourSteps.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentStep(index)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  index === currentStep 
                    ? "w-6 bg-primary" 
                    : index < currentStep 
                      ? "w-1.5 bg-primary/40" 
                      : "w-1.5 bg-muted-foreground/30"
                )}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {!isFirstStep && (
              <Button variant="outline" onClick={handlePrevious} className="gap-1 rounded-xl">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            )}
            <Button onClick={handleNext} className="flex-1 gap-1 rounded-xl">
              {isLastStep ? "Finish Tour" : "Next"}
              {!isLastStep && <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}
