import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef, useState } from "react";
import {
  Search,
  TrendingUp,
  Mail,
  CreditCard,
  Heart,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

const systemSteps = [
  {
    letter: "S",
    title: "Search & Visibility",
    subtitle: "Get Found",
    description:
      "Make sure customers can find you when they need you. Google search, local SEO, reviews, social visibility, and paid ads.",
    icon: Search,
    color: "bg-primary/10 text-primary",
  },
  {
    letter: "Y",
    title: "Yield Optimization",
    subtitle: "Convert Visitors",
    description:
      "Turn website visitors into real leads. Clear messaging, fast pages, mobile-friendly design, and effective CTAs.",
    icon: TrendingUp,
    color: "bg-emerald-500/10 text-emerald-600",
  },
  {
    letter: "S",
    title: "Sequence & Nurture",
    subtitle: "Warm Up Leads",
    description:
      "Automated email sequences, SMS reminders, retargeting ads, and chat follow-ups that convert curious visitors into motivated buyers.",
    icon: Mail,
    color: "bg-blue-500/10 text-blue-600",
  },
  {
    letter: "T",
    title: "Transaction Activation",
    subtitle: "Close Deals",
    description:
      "Speed to lead response, booking systems, quoting process optimization, and follow-up sequences that turn warm leads into customers.",
    icon: CreditCard,
    color: "bg-violet-500/10 text-violet-600",
  },
  {
    letter: "E",
    title: "Engagement & Retention",
    subtitle: "Build Loyalty",
    description:
      "Review generation, post-purchase follow-up, loyalty incentives, and referral programs that turn customers into advocates.",
    icon: Heart,
    color: "bg-rose-500/10 text-rose-600",
  },
  {
    letter: "M",
    title: "Metrics & Improvement",
    subtitle: "Track & Optimize",
    description:
      "GA4 setup, KPI dashboards, attribution tracking, and monthly reporting that creates a continuous improvement loop.",
    icon: BarChart3,
    color: "bg-amber-500/10 text-amber-600",
  },
];

export function SystemSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [activeStep, setActiveStep] = useState(0);

  return (
    <section id="system" className="section-padding bg-background">
      <div className="container-wide mx-auto" ref={ref}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            Our Proven Framework
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-semibold text-foreground mb-4">
            The 6-Step <span className="text-gradient">SYSTEM</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            A complete, structured digital marketing engine designed specifically
            for small and midsize businesses.
          </p>
        </motion.div>

        {/* SYSTEM Letters Display */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex justify-center gap-2 sm:gap-4 mb-12"
        >
          {systemSteps.map((step, index) => (
            <button
              key={index}
              onClick={() => setActiveStep(index)}
              className={cn(
                "w-12 h-12 sm:w-16 sm:h-16 rounded-xl flex items-center justify-center font-display font-bold text-xl sm:text-2xl transition-all duration-300",
                activeStep === index
                  ? "bg-primary text-primary-foreground shadow-glow scale-110"
                  : "bg-secondary text-muted-foreground hover:bg-muted"
              )}
            >
              {step.letter}
            </button>
          ))}
        </motion.div>

        {/* Active Step Detail */}
        <motion.div
          key={activeStep}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="max-w-3xl mx-auto mb-16"
        >
          <div className="card-elevated p-6 sm:p-8 md:p-10">
            <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
              <div
                className={cn(
                  "w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center shrink-0",
                  systemSteps[activeStep].color
                )}
              >
                {(() => {
                  const Icon = systemSteps[activeStep].icon;
                  return <Icon size={24} className="sm:w-7 sm:h-7" />;
                })()}
              </div>
              <div>
                <div className="text-sm font-medium text-primary mb-1">
                  {systemSteps[activeStep].subtitle}
                </div>
                <h3 className="text-xl sm:text-2xl md:text-3xl font-display font-semibold text-foreground mb-3">
                  {systemSteps[activeStep].title}
                </h3>
                <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                  {systemSteps[activeStep].description}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* All Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {systemSteps.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
              className={cn(
                "p-6 rounded-xl border transition-all duration-300 cursor-pointer",
                activeStep === index
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/50"
              )}
              onClick={() => setActiveStep(index)}
            >
              <div className="flex items-center gap-4 mb-3">
                <div
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center font-display font-bold",
                    activeStep === index
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground"
                  )}
                >
                  {step.letter}
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">{step.title}</h4>
                  <p className="text-xs text-primary">{step.subtitle}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
