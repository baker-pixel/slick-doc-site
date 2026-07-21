import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";
import { Check, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { pricingData } from "@/lib/pricingData";

const tiers = [
  {
    name: "SYSTEM Foundation",
    level: "Level I",
    price: pricingData.foundation.price,
    description: "We optimize your existing digital presence. You do nothing—we handle it all.",
    scoreRange: "65-100",
    features: [
      "We tune up your website for conversions",
      "We boost your local visibility",
      "We clean up your SEO",
      "We set up review generation",
      "We configure your analytics",
      "We post to your Google Business Profile",
      "We write 1 blog article/month",
      "We optimize SEO quarterly",
    ],
    popular: false,
  },
  {
    name: "SYSTEM Growth",
    level: "Level II",
    price: pricingData.growth.price,
    priceSuffix: pricingData.growth.priceSuffix,
    description: "We build and run multi-channel campaigns. You approve—we execute everything.",
    scoreRange: "40-64",
    features: [
      "Everything in Level I",
      "We build 3-5 landing pages",
      "We create email & SMS automation",
      "We run your retargeting ads",
      "We optimize your CRM pipeline",
      "We write 2 blogs/month",
      "We optimize SEO monthly",
      "We brief you on monthly calls",
    ],
    popular: true,
  },
  {
    name: "SYSTEM Transformation",
    level: "Level III",
    price: pricingData.transformation.price,
    priceSuffix: pricingData.transformation.priceSuffix,
    description: "We rebuild your entire digital infrastructure from scratch. Total hands-off for you.",
    scoreRange: "0-39",
    features: [
      "Everything in Level II",
      "We rebuild your entire website",
      "We run advanced SEO programs",
      "We create lead magnets for you",
      "We build your complete sales funnel",
      "We set up sales enablement",
      "We build your retention engine",
      "We deliver full analytics suite",
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
            100% Done-For-You
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-semibold text-foreground mb-4">
            One Monthly Fee. We Do Everything.
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            <span className="font-semibold text-foreground">Zero work on your end.</span>{" "}
            Choose your level, and we handle strategy, execution, optimization, and reporting—completely hands-off for you.
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
                "relative rounded-2xl p-6 sm:p-8 transition-all duration-300",
                tier.popular
                  ? "bg-accent text-accent-foreground border-2 border-primary shadow-elevated lg:scale-105"
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
