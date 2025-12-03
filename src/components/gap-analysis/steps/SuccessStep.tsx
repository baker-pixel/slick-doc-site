import { motion } from "framer-motion";
import { CheckCircle, ArrowRight, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface SuccessStepProps {
  businessName: string;
  resumeToken?: string;
}

export function SuccessStep({ businessName, resumeToken }: SuccessStepProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center py-12"
    >
      <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
        <CheckCircle className="text-emerald-600" size={40} />
      </div>
      
      <h2 className="text-3xl font-display font-semibold text-foreground mb-4">
        Gap Analysis Submitted!
      </h2>
      
      <p className="text-muted-foreground max-w-md mx-auto mb-8">
        Thank you, <span className="font-medium text-foreground">{businessName}</span>! 
        We&apos;ve received your intake form and will begin analyzing your digital presence immediately.
      </p>

      {resumeToken && (
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-6 max-w-lg mx-auto mb-8">
          <h3 className="font-semibold text-foreground mb-3 flex items-center justify-center gap-2">
            <LayoutDashboard size={20} className="text-primary" />
            Your Personal Dashboard
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Access your personalized dashboard anytime to view your SYSTEM scores, recommendations, and track your progress.
          </p>
          <Link to={`/dashboard/${resumeToken}`}>
            <Button className="bg-primary hover:bg-orange-dark text-primary-foreground gap-2">
              View Your Dashboard
              <ArrowRight size={16} />
            </Button>
          </Link>
        </div>
      )}

      <div className="bg-secondary/50 rounded-xl p-6 max-w-lg mx-auto mb-8">
        <h3 className="font-semibold text-foreground mb-3">What happens next?</h3>
        <ul className="text-left text-sm text-muted-foreground space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold">1.</span>
            Our team will review your responses and scan your digital footprint
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold">2.</span>
            We&apos;ll prepare your personalized SYSTEM Gap Report
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold">3.</span>
            You&apos;ll receive your report within 24-48 business hours
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold">4.</span>
            We&apos;ll schedule a call to walk through the findings together
          </li>
        </ul>
      </div>

      <Link to="/">
        <Button variant="outline" className="gap-2">
          Return to Homepage
          <ArrowRight size={16} />
        </Button>
      </Link>
    </motion.div>
  );
}
