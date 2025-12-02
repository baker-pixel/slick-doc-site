import { motion } from "framer-motion";
import { Check, ArrowRight, Zap, Star, Crown } from "lucide-react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const plans = [
  {
    name: "Starter",
    description: "Perfect for small businesses just getting started with digital marketing",
    price: 1497,
    period: "/month",
    icon: Zap,
    features: [
      "SYSTEM Gap Analysis",
      "Monthly strategy call",
      "Basic SEO optimization",
      "Google Business Profile setup",
      "Email marketing setup",
      "Monthly performance report",
    ],
    cta: "Get Started",
    popular: false,
  },
  {
    name: "Growth",
    description: "For businesses ready to scale their marketing and generate consistent leads",
    price: 2997,
    period: "/month",
    icon: Star,
    features: [
      "Everything in Starter, plus:",
      "Bi-weekly strategy calls",
      "Advanced SEO & content strategy",
      "Paid ads management (up to $3k/mo spend)",
      "CRM setup & automation",
      "Lead nurture sequences",
      "Review generation system",
      "Weekly performance reports",
    ],
    cta: "Scale Your Business",
    popular: true,
  },
  {
    name: "Enterprise",
    description: "Full-service marketing partnership for established businesses",
    price: 5997,
    period: "/month",
    icon: Crown,
    features: [
      "Everything in Growth, plus:",
      "Weekly strategy calls",
      "Full funnel optimization",
      "Unlimited paid ads management",
      "Custom integrations",
      "Dedicated account manager",
      "Priority support",
      "Quarterly business reviews",
      "Custom reporting dashboard",
    ],
    cta: "Contact Sales",
    popular: false,
  },
];

const faqs = [
  {
    question: "What's included in the SYSTEM Gap Analysis?",
    answer: "Our comprehensive analysis evaluates your business across all six SYSTEM areas: Search & Visibility, Yield Optimization, Sequence & Nurture, Transaction Activation, Engagement & Retention, and Metrics & Improvement.",
  },
  {
    question: "Can I change plans later?",
    answer: "Absolutely! You can upgrade or downgrade your plan at any time. Changes take effect at the start of your next billing cycle.",
  },
  {
    question: "Is there a contract or commitment?",
    answer: "We work on a month-to-month basis with no long-term contracts. We believe in earning your business every month through results.",
  },
  {
    question: "What if I need something custom?",
    answer: "We're happy to create custom packages for businesses with unique needs. Schedule a strategy call to discuss your requirements.",
  },
];

export default function Pricing() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="pt-32 pb-20">
        <div className="container-wide mx-auto px-4">
          <div className="mb-6">
            <BackButton />
          </div>

          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-3xl mx-auto mb-16"
          >
            <Badge className="mb-4 bg-primary/10 text-primary border-0">
              Simple, Transparent Pricing
            </Badge>
            <h1 className="text-4xl sm:text-5xl font-display font-semibold text-foreground mb-4">
              Invest in Growth That <span className="text-gradient">Pays for Itself</span>
            </h1>
            <p className="text-lg text-muted-foreground">
              Choose the plan that fits your business. All plans include our proven SYSTEM methodology 
              and dedicated support to help you grow.
            </p>
          </motion.div>

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-20">
            {plans.map((plan, index) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="relative"
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                    <Badge className="bg-primary text-primary-foreground shadow-lg">
                      Most Popular
                    </Badge>
                  </div>
                )}
                <Card className={`h-full flex flex-col transition-all duration-300 hover:shadow-xl ${
                  plan.popular 
                    ? "border-primary shadow-lg scale-105" 
                    : "border-border hover:border-primary/50"
                }`}>
                  <CardHeader className="text-center pb-4">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
                      plan.popular ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                    }`}>
                      <plan.icon size={28} />
                    </div>
                    <CardTitle className="text-2xl font-display">{plan.name}</CardTitle>
                    <CardDescription className="min-h-[48px]">{plan.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <div className="text-center mb-6">
                      <span className="text-4xl font-bold text-foreground">${plan.price.toLocaleString()}</span>
                      <span className="text-muted-foreground">{plan.period}</span>
                    </div>
                    
                    <ul className="space-y-3 mb-8 flex-1">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                          <span className="text-sm text-muted-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    
                    <Button 
                      size="lg" 
                      className={`w-full ${
                        plan.popular 
                          ? "bg-primary hover:bg-primary/90" 
                          : "bg-secondary text-foreground hover:bg-secondary/80"
                      }`}
                      asChild
                    >
                      <Link to="/schedule">
                        {plan.cta}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Trust Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-center mb-20"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary border border-border mb-4">
              <Check className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">30-day money-back guarantee</span>
            </div>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Not satisfied? We'll refund your first month, no questions asked. 
              We're confident our SYSTEM will deliver results for your business.
            </p>
          </motion.div>

          {/* FAQs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="max-w-3xl mx-auto"
          >
            <h2 className="text-3xl font-display font-semibold text-foreground text-center mb-10">
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
              {faqs.map((faq, index) => (
                <Card key={index} className="border-border">
                  <CardContent className="pt-6">
                    <h3 className="font-semibold text-foreground mb-2">{faq.question}</h3>
                    <p className="text-muted-foreground text-sm">{faq.answer}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="text-center mt-20"
          >
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20 max-w-2xl mx-auto">
              <CardContent className="pt-8 pb-8">
                <h3 className="text-2xl font-display font-semibold text-foreground mb-3">
                  Not Sure Which Plan is Right?
                </h3>
                <p className="text-muted-foreground mb-6">
                  Take our free Gap Analysis to get personalized recommendations based on your business needs.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button size="lg" asChild>
                    <Link to="/gap-analysis">
                      Get Free Gap Analysis
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <Link to="/schedule">
                      Schedule a Call
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
