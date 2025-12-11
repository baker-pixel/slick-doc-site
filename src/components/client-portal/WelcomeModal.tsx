import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  Sparkles, 
  LayoutDashboard, 
  MessageCircle, 
  FileCheck, 
  BarChart3,
  ArrowRight,
  Rocket
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WelcomeModalProps {
  open: boolean;
  onClose: () => void;
  onStartTour: () => void;
  clientName?: string;
  businessName?: string;
}

const features = [
  {
    icon: LayoutDashboard,
    title: "Track Your Projects",
    description: "Monitor project progress, milestones, and deliverables in real-time.",
  },
  {
    icon: MessageCircle,
    title: "Communicate Easily",
    description: "Send messages, schedule meetings, and submit requests all in one place.",
  },
  {
    icon: FileCheck,
    title: "Approve Content",
    description: "Review and approve marketing content with a single click.",
  },
  {
    icon: BarChart3,
    title: "See Your Results",
    description: "Access analytics and reports showing your marketing performance.",
  },
];

export function WelcomeModal({ open, onClose, onStartTour, clientName, businessName }: WelcomeModalProps) {
  const [step, setStep] = useState(0);

  const handleNext = () => {
    if (step < 1) {
      setStep(step + 1);
    } else {
      onClose();
      onStartTour();
    }
  };

  const handleSkip = () => {
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden border-0 bg-gradient-to-b from-background to-muted/20">
        {step === 0 ? (
          <>
            {/* Hero Section */}
            <div className="relative px-6 pt-8 pb-6 text-center bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
              <div className="absolute top-4 right-4">
                <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground text-xs">
                  Skip
                </Button>
              </div>
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-xl shadow-primary/25 mb-4">
                <Sparkles className="h-8 w-8" />
              </div>
              <DialogHeader className="space-y-2">
                <DialogTitle className="text-2xl font-bold">
                  Welcome{clientName ? `, ${clientName.split(' ')[0]}` : ''}! 🎉
                </DialogTitle>
                <DialogDescription className="text-base">
                  {businessName ? (
                    <>Your <span className="font-medium text-foreground">{businessName}</span> client portal is ready.</>
                  ) : (
                    <>Your client portal is ready to use.</>
                  )}
                </DialogDescription>
              </DialogHeader>
            </div>

            {/* Content */}
            <div className="px-6 pb-6 space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Everything you need to collaborate with your marketing team is right here. Let's take a quick look at what you can do.
              </p>
              <Button onClick={handleNext} className="w-full gap-2 h-11 rounded-xl">
                Show Me Around
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Features Section */}
            <div className="px-6 pt-6 pb-2">
              <DialogHeader className="mb-4">
                <DialogTitle className="text-lg font-bold">Here's what you can do</DialogTitle>
              </DialogHeader>
            </div>

            <div className="px-6 pb-2 space-y-3">
              {features.map((feature, index) => (
                <div
                  key={feature.title}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-xl transition-all",
                    "bg-muted/50 hover:bg-muted/80"
                  )}
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">{feature.title}</h4>
                    <p className="text-xs text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="px-6 py-4 bg-muted/30 border-t flex gap-3">
              <Button variant="outline" onClick={handleSkip} className="flex-1 rounded-xl">
                I'll Explore Myself
              </Button>
              <Button onClick={handleNext} className="flex-1 gap-2 rounded-xl">
                <Rocket className="h-4 w-4" />
                Start Tour
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
