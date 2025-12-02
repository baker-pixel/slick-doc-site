import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";
import { Check, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

const tiers = [
  {
    name: "SYSTEM Foundation",
    level: "Level I",
    price: "249",
    description: "For businesses with light-to-moderate gaps that need structure and optimization.",
    scoreRange: "65-100",
    features: [
      "Website Conversion Tune-Up",
      "Local Visibility Upgrade",
      "Basic SEO Cleanup",
      "Review Generation Setup",
      "Analytics & KPI Setup",
      "Monthly GBP Posts",
      "1 Blog Article/Month",
      "Quarterly SEO Tuning",
    ],
    popular: false,
  },
  {
    name: "SYSTEM Growth",
    level: "Level II",
    price: "449",
    priceSuffix: "–549",
    description: "For SMBs with moderate gaps who need activation across multiple channels.",
    scoreRange: "40-64",
    features: [
      "Everything in Level I",
      "Landing Page Pack (3-5 pages)",
      "Email & SMS Automation",
      "Retargeting Ads Setup",
      "CRM Pipeline Optimization",
      "2 Blogs/Month",
      "Monthly SEO Optimization",
      "Monthly Strategy Call",
    ],
    popular: true,
  },
  {
    name: "SYSTEM Transformation",
    level: "Level III",
    price: "799",
    priceSuffix: "–999",
    description: "For businesses requiring a full rebuild of their digital infrastructure.",
    scoreRange: "0-39",
    features: [
      "Everything in Level II",
      "Full Website Rebuild",
      "Advanced SEO Program",
      "Lead Magnet Development",
      "Full Funnel Buildout",
      "Sales Enablement System",
      "Retention Engine Setup",
      "Full Analytics Suite",
    ],
    popular: false,
  },
];

export function Pricing() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="pricing" className="section-padding bg-cream">
      <div className="container-wide mx-auto" ref={ref}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            Marketing as a Service
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-semibold text-foreground mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            No à-la-carte. No one-off projects. Just complete, outcome-driven systems 
            that create predictable growth.
          </p>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {tiers.map((tier, index) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.15 }}
              className={cn(
                "relative rounded-2xl p-8 transition-all duration-300",
                tier.popular
                  ? "bg-accent text-accent-foreground border-2 border-primary shadow-elevated scale-105"
                  : "bg-card border border-border hover:border-primary/50"
              )}
            >
              {tier.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-primary-foreground text-sm font-medium rounded-full flex items-center gap-1">
                  <Star size={14} className="fill-current" />
                  Most Popular
                </div>
              )}

              <div className="mb-6">
                <span
                  className={cn(
                    "text-xs font-medium px-2 py-1 rounded",
                    tier.popular
                      ? "bg-primary/20 text-primary-foreground"
                      : "bg-secondary text-muted-foreground"
                  )}
                >
                  {tier.level}
                </span>
                <h3
                  className={cn(
                    "text-2xl font-display font-semibold mt-3",
                    tier.popular ? "text-accent-foreground" : "text-foreground"
                  )}
                >
                  {tier.name}
                </h3>
                <p
                  className={cn(
                    "text-sm mt-2",
                    tier.popular
                      ? "text-accent-foreground/70"
                      : "text-muted-foreground"
                  )}
                >
                  {tier.description}
                </p>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span
                    className={cn(
                      "text-4xl font-display font-bold",
                      tier.popular ? "text-primary" : "text-foreground"
                    )}
                  >
                    ${tier.price}
                  </span>
                  {tier.priceSuffix && (
                    <span
                      className={cn(
                        "text-2xl font-display",
                        tier.popular
                          ? "text-accent-foreground/70"
                          : "text-muted-foreground"
                      )}
                    >
                      {tier.priceSuffix}
                    </span>
                  )}
                  <span
                    className={cn(
                      "text-sm",
                      tier.popular
                        ? "text-accent-foreground/70"
                        : "text-muted-foreground"
                    )}
                  >
                    /month
                  </span>
                </div>
                <p
                  className={cn(
                    "text-xs mt-1",
                    tier.popular
                      ? "text-accent-foreground/50"
                      : "text-muted-foreground"
                  )}
                >
                  SYSTEM Score: {tier.scoreRange}
                </p>
              </div>

              <ul className="space-y-3 mb-8">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check
                      size={18}
                      className={cn(
                        "shrink-0 mt-0.5",
                        tier.popular ? "text-primary" : "text-primary"
                      )}
                    />
                    <span
                      className={cn(
                        "text-sm",
                        tier.popular
                          ? "text-accent-foreground/90"
                          : "text-foreground/80"
                      )}
                    >
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Button
                className={cn(
                  "w-full",
                  tier.popular
                    ? "bg-primary hover:bg-orange-dark text-primary-foreground"
                    : "bg-secondary hover:bg-muted text-foreground"
                )}
                asChild
              >
                <Link to="/schedule">Get Started</Link>
              </Button>
            </motion.div>
          ))}
        </div>

        {/* Note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="text-center text-sm text-muted-foreground mt-12"
        >
          All plans include a 12-month commitment. $0 upfront cost.
        </motion.p>
      </div>
    </section>
  );
}
