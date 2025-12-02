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
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const systemSteps = [
  {
    letter: "S",
    title: "Search & Visibility",
    subtitle: "Get Found",
    description:
      "Make sure customers can find you when they need you. Google search, local SEO, reviews, social visibility, and paid ads.",
    icon: Search,
    color: "bg-primary/10 text-primary",
    borderColor: "border-primary",
    details: [
      "SEO strategy and keyword research tailored to your industry",
      "Google Business Profile optimization for local dominance",
      "Review generation and reputation management",
      "Social media presence and content strategy",
      "Strategic paid advertising (Google Ads, Facebook, etc.)",
    ],
    outcomes: [
      "Higher rankings in search results",
      "More organic traffic to your website",
      "Increased brand visibility in your market",
      "Better quality leads from targeted searches",
    ],
  },
  {
    letter: "Y",
    title: "Yield Optimization",
    subtitle: "Convert Visitors",
    description:
      "Turn website visitors into real leads. Clear messaging, fast pages, mobile-friendly design, and effective CTAs.",
    icon: TrendingUp,
    color: "bg-emerald-500/10 text-emerald-600",
    borderColor: "border-emerald-500",
    details: [
      "Website conversion rate optimization (CRO)",
      "Clear, compelling messaging that speaks to your customers",
      "Mobile-first responsive design",
      "Fast page load speeds and technical optimization",
      "Strategic call-to-action placement and design",
    ],
    outcomes: [
      "Higher conversion rates from traffic",
      "More leads from the same amount of visitors",
      "Better user experience and lower bounce rates",
      "Clearer value proposition for prospects",
    ],
  },
  {
    letter: "S",
    title: "Sequence & Nurture",
    subtitle: "Warm Up Leads",
    description:
      "Automated email sequences, SMS reminders, retargeting ads, and chat follow-ups that convert curious visitors into motivated buyers.",
    icon: Mail,
    color: "bg-blue-500/10 text-blue-600",
    borderColor: "border-blue-500",
    details: [
      "Automated email drip campaigns for different segments",
      "SMS follow-up sequences for high-intent leads",
      "Retargeting ads to stay top-of-mind",
      "CRM integration and lead scoring",
      "Personalized content based on behavior and interests",
    ],
    outcomes: [
      "Leads stay engaged until ready to buy",
      "Automated follow-up saves time and effort",
      "Higher conversion from leads to customers",
      "Better relationship building at scale",
    ],
  },
  {
    letter: "T",
    title: "Transaction Activation",
    subtitle: "Close Deals",
    description:
      "Speed to lead response, booking systems, quoting process optimization, and follow-up sequences that turn warm leads into customers.",
    icon: CreditCard,
    color: "bg-violet-500/10 text-violet-600",
    borderColor: "border-violet-500",
    details: [
      "Speed-to-lead optimization (respond within minutes)",
      "Online booking and scheduling systems",
      "Streamlined quoting and proposal process",
      "Sales enablement tools and training",
      "Follow-up sequences for quote follow-through",
    ],
    outcomes: [
      "Faster response time to new leads",
      "Higher close rates from qualified leads",
      "Streamlined sales process",
      "Better tracking of sales pipeline",
    ],
  },
  {
    letter: "E",
    title: "Engagement & Retention",
    subtitle: "Build Loyalty",
    description:
      "Review generation, post-purchase follow-up, loyalty incentives, and referral programs that turn customers into advocates.",
    icon: Heart,
    color: "bg-rose-500/10 text-rose-600",
    borderColor: "border-rose-500",
    details: [
      "Automated review request campaigns",
      "Post-purchase follow-up sequences",
      "Customer loyalty and rewards programs",
      "Referral program design and implementation",
      "Win-back campaigns for dormant customers",
    ],
    outcomes: [
      "More positive reviews and testimonials",
      "Higher customer lifetime value",
      "Increased repeat business",
      "More referrals from happy customers",
    ],
  },
  {
    letter: "M",
    title: "Metrics & Improvement",
    subtitle: "Track & Optimize",
    description:
      "GA4 setup, KPI dashboards, attribution tracking, and monthly reporting that creates a continuous improvement loop.",
    icon: BarChart3,
    color: "bg-amber-500/10 text-amber-600",
    borderColor: "border-amber-500",
    details: [
      "Google Analytics 4 setup and configuration",
      "Custom KPI dashboards for real-time insights",
      "Attribution tracking across all channels",
      "Monthly performance reporting and analysis",
      "A/B testing and continuous optimization",
    ],
    outcomes: [
      "Clear visibility into what's working",
      "Data-driven decision making",
      "Continuous improvement over time",
      "Better ROI on marketing spend",
    ],
  },
];

export default function System() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [activeStep, setActiveStep] = useState(0);

  return (
    <div className="min-h-screen">
      <Header />
      <main>
        {/* Hero Section */}
        <section className="pt-32 pb-16 bg-gradient-to-b from-primary/5 to-background">
          <div className="container-wide mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center max-w-4xl mx-auto"
            >
              <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
                Our Proven Framework
              </span>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-semibold text-foreground mb-6">
                The 6-Step <span className="text-gradient">SYSTEM</span>{" "}
                Methodology
              </h1>
              <p className="text-muted-foreground text-lg sm:text-xl mb-8 max-w-3xl mx-auto">
                A complete, structured digital marketing engine designed
                specifically for small and midsize businesses. Each step builds
                on the last to create a self-reinforcing growth machine.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Button size="lg" asChild>
                  <Link to="/gap-analysis">
                    Get Your Free Analysis
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/#contact">Contact Us</Link>
                </Button>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Interactive SYSTEM Navigator */}
        <section className="py-16 bg-background" ref={ref}>
          <div className="container-wide mx-auto px-4">
            {/* SYSTEM Letters Display */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5 }}
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

            {/* Active Step Detail Card */}
            <motion.div
              key={activeStep}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="max-w-5xl mx-auto"
            >
              <div
                className={cn(
                  "card-elevated p-8 sm:p-10 border-l-4",
                  systemSteps[activeStep].borderColor
                )}
              >
                <div className="flex flex-col lg:flex-row gap-8">
                  {/* Left: Overview */}
                  <div className="lg:w-1/2">
                    <div className="flex items-start gap-4 mb-6">
                      <div
                        className={cn(
                          "w-16 h-16 rounded-2xl flex items-center justify-center shrink-0",
                          systemSteps[activeStep].color
                        )}
                      >
                        {(() => {
                          const Icon = systemSteps[activeStep].icon;
                          return <Icon size={28} />;
                        })()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-primary mb-1">
                          Step {activeStep + 1}: {systemSteps[activeStep].subtitle}
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-display font-semibold text-foreground">
                          {systemSteps[activeStep].title}
                        </h2>
                      </div>
                    </div>
                    <p className="text-muted-foreground leading-relaxed mb-6">
                      {systemSteps[activeStep].description}
                    </p>

                    <h3 className="font-semibold text-foreground mb-3">
                      What We Do:
                    </h3>
                    <ul className="space-y-2">
                      {systemSteps[activeStep].details.map((detail, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                          <span className="text-muted-foreground">{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Right: Outcomes */}
                  <div className="lg:w-1/2 lg:border-l lg:border-border lg:pl-8">
                    <h3 className="font-semibold text-foreground mb-4">
                      Expected Outcomes:
                    </h3>
                    <div className="space-y-3">
                      {systemSteps[activeStep].outcomes.map((outcome, i) => (
                        <div
                          key={i}
                          className="p-4 rounded-lg bg-secondary/50 border border-border"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-primary font-semibold text-sm">
                                {i + 1}
                              </span>
                            </div>
                            <span className="text-foreground">{outcome}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* All Steps Overview */}
        <section className="py-16 bg-secondary/30">
          <div className="container-wide mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5 }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl sm:text-4xl font-display font-semibold text-foreground mb-4">
                The Complete Journey
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Each step of the SYSTEM builds on the previous one, creating a
                powerful flywheel effect for your business growth.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {systemSteps.map((step, index) => (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 30 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.1 + index * 0.1 }}
                  className={cn(
                    "p-6 rounded-xl border transition-all duration-300 cursor-pointer bg-card hover:shadow-lg",
                    activeStep === index
                      ? "border-primary shadow-glow"
                      : "border-border hover:border-primary/50"
                  )}
                  onClick={() => {
                    setActiveStep(index);
                    window.scrollTo({ top: 400, behavior: "smooth" });
                  }}
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div
                      className={cn(
                        "w-12 h-12 rounded-lg flex items-center justify-center font-display font-bold text-lg",
                        activeStep === index
                          ? "bg-primary text-primary-foreground"
                          : step.color
                      )}
                    >
                      {step.letter}
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">
                        {step.title}
                      </h3>
                      <p className="text-xs text-primary">{step.subtitle}</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {step.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-primary/5">
          <div className="container-wide mx-auto px-4 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-3xl sm:text-4xl font-display font-semibold text-foreground mb-4">
                Ready to Build Your SYSTEM?
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
                Take our free Gap Analysis to see where your business stands
                across all six SYSTEM areas and get personalized recommendations.
              </p>
              <Button size="lg" asChild>
                <Link to="/gap-analysis">
                  Start Your Free Gap Analysis
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
