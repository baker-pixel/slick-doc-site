import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { CalendarCheck, CheckCircle, LogIn, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    icon: Mail,
    title: "Check your inbox",
    body: "Your client portal invitation is on its way from hello@orangedoormarketing.com. It usually arrives within a few minutes. If you don't see it, check your spam folder.",
  },
  {
    icon: LogIn,
    title: "Set up your login",
    body: "Open the invitation and choose a password. The link stays valid for 7 days.",
  },
  {
    icon: CalendarCheck,
    title: "Tell us about your business",
    body: "Inside the portal, a short guided setup connects your website and social accounts so we can start your first month of work.",
  },
];

// Shown on /signup after Stripe sends the customer back with ?checkout=success.
export function PaymentThankYou() {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto text-center">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
        <CheckCircle className="h-10 w-10 text-primary" />
      </div>
      <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
        Payment received
      </span>
      <h1 className="text-3xl sm:text-5xl font-display font-semibold text-foreground mb-4">Welcome to Orange Door</h1>
      <p className="text-lg text-muted-foreground max-w-xl mx-auto">
        Thank you for trusting us with your marketing. Your subscription is active and we're setting up your account now.
        A receipt from Stripe is also on its way to your email.
      </p>

      <div className="mt-10 rounded-2xl border border-border bg-card p-6 sm:p-8 text-left">
        <h2 className="text-xl font-display font-semibold text-foreground mb-6">What happens next</h2>
        <ol className="space-y-6">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                {i + 1}
              </div>
              <div>
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <Icon className="h-4 w-4 text-primary" />
                  {title}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        Questions? Reply to your welcome email or reach us at{" "}
        <a href="mailto:hello@orangedoormarketing.com" className="text-primary hover:underline">
          hello@orangedoormarketing.com
        </a>
        .
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link to="/">Back to Home</Link>
      </Button>
    </motion.div>
  );
}
