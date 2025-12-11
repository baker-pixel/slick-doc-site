import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Check, ArrowRight, Star, Target, Mail, RefreshCw, Users, FileText, LineChart, Phone } from "lucide-react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TierInterestForm } from "@/components/TierInterestForm";

const heroImages = [
  "https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200&h=600&fit=crop",
  "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=1200&h=600&fit=crop",
  "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=1200&h=600&fit=crop",
];

const features = [
  {
    icon: Check,
    title: "Everything in Level I",
    description: "All Foundation features included as your baseline for growth.",
    highlight: true,
  },
  {
    icon: Target,
    title: "Landing Page Pack (3-5 pages)",
    description: "High-converting landing pages designed for your key services and campaigns.",
  },
  {
    icon: Mail,
    title: "Email & SMS Automation",
    description: "Automated nurture sequences that convert leads while you sleep.",
  },
  {
    icon: RefreshCw,
    title: "Retargeting Ads Setup",
    description: "Re-engage website visitors with strategic remarketing campaigns.",
  },
  {
    icon: Users,
    title: "CRM Pipeline Optimization",
    description: "Streamline your sales process with optimized pipeline stages and automation.",
  },
  {
    icon: FileText,
    title: "2 Blogs/Month",
    description: "Double the content to accelerate your organic growth and authority.",
  },
  {
    icon: LineChart,
    title: "Monthly SEO Optimization",
    description: "Continuous improvements to keep you climbing the search rankings.",
  },
  {
    icon: Phone,
    title: "Monthly Strategy Call",
    description: "Dedicated time with your strategist to review progress and plan ahead.",
  },
];

const results = [
  { metric: "50%", label: "Average increase in qualified leads" },
  { metric: "3x", label: "ROI on marketing spend" },
  { metric: "60%", label: "Faster sales cycle" },
];

export default function TierGrowth() {
  const [currentImage, setCurrentImage] = useState(0);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImage((prev) => (prev + 1) % heroImages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <TierInterestForm tierName={showForm ? "SYSTEM Growth" : null} onClose={() => setShowForm(false)} />

      <main className="pt-24">
        {/* Hero Section with Auto-playing Images */}
        <section className="relative h-[60vh] min-h-[500px] overflow-hidden">
          {heroImages.map((img, index) => (
            <motion.div
              key={index}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: currentImage === index ? 1 : 0 }}
              transition={{ duration: 1 }}
            >
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${img})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
            </motion.div>
          ))}
          
          <div className="relative z-10 container-wide mx-auto px-4 h-full flex items-center">
            <div className="max-w-2xl">
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                <BackButton className="mb-6" />
                <div className="flex gap-2 mb-4">
                  <Badge className="bg-primary text-primary-foreground">
                    Most Popular
                  </Badge>
                  <Badge className="bg-primary/20 text-primary border-primary/30">
                    Level II • Score 40-64
                  </Badge>
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold text-foreground mb-4">
                  SYSTEM <span className="text-gradient">Growth</span>
                </h1>
                <p className="text-xl text-muted-foreground mb-6">
                  For SMBs with moderate gaps who need activation across multiple channels to scale effectively.
                </p>
                <div className="flex items-baseline gap-2 mb-8">
                  <span className="text-5xl font-bold text-foreground">$449</span>
                  <span className="text-2xl text-muted-foreground">–549</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <div className="flex gap-4">
                  <Button size="lg" onClick={() => setShowForm(true)}>
                    Get Started
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <Link to="/gap-analysis">Take Gap Analysis</Link>
                  </Button>
                </div>
              </motion.div>
            </div>
          </div>

          {/* Image indicators */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 z-20">
            {heroImages.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentImage(index)}
                className={`w-2 h-2 rounded-full transition-all ${
                  currentImage === index ? "bg-primary w-8" : "bg-foreground/30"
                }`}
              />
            ))}
          </div>
        </section>

        {/* What's Included */}
        <section className="py-20 bg-muted/30">
          <div className="container-wide mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl sm:text-4xl font-display font-semibold text-foreground mb-4">
                Everything You Get
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Multi-channel activation to turn your marketing into a growth engine.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className={`h-full hover:shadow-lg transition-shadow ${
                    feature.highlight 
                      ? "border-primary bg-primary/5" 
                      : "border-border hover:border-primary/30"
                  }`}>
                    <CardContent className="pt-6">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                        feature.highlight ? "bg-primary text-primary-foreground" : "bg-primary/10"
                      }`}>
                        <feature.icon className={`h-6 w-6 ${feature.highlight ? "" : "text-primary"}`} />
                      </div>
                      <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground">{feature.description}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Expected Results */}
        <section className="py-20">
          <div className="container-wide mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl sm:text-4xl font-display font-semibold text-foreground mb-4">
                Expected Results
              </h2>
              <p className="text-muted-foreground">
                What our Growth clients typically achieve within the first 6 months.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              {results.map((result, index) => (
                <motion.div
                  key={result.label}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.15 }}
                  className="text-center"
                >
                  <div className="text-5xl font-bold text-primary mb-2">{result.metric}</div>
                  <p className="text-muted-foreground">{result.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Why Growth is Popular */}
        <section className="py-20 bg-muted/30">
          <div className="container-wide mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-3xl mx-auto text-center"
            >
              <Star className="h-12 w-12 text-primary mx-auto mb-6" />
              <h2 className="text-3xl font-display font-semibold text-foreground mb-4">
                Why Growth is Our Most Popular Plan
              </h2>
              <p className="text-muted-foreground mb-6">
                The Growth tier hits the sweet spot for most businesses. You get the foundational fixes PLUS 
                the multi-channel activation that actually drives measurable results. It's where most 
                businesses see the fastest ROI on their marketing investment.
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <Badge variant="outline">Best Value</Badge>
                <Badge variant="outline">Multi-Channel</Badge>
                <Badge variant="outline">Dedicated Support</Badge>
                <Badge variant="outline">Proven Results</Badge>
              </div>
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 bg-gradient-to-br from-primary/10 to-primary/5">
          <div className="container-wide mx-auto px-4 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <Star className="h-16 w-16 text-primary mx-auto mb-6" />
              <h2 className="text-3xl sm:text-4xl font-display font-semibold text-foreground mb-4">
                Ready to Accelerate Your Growth?
              </h2>
              <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                Join the majority of our clients who chose Growth and never looked back.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" onClick={() => setShowForm(true)}>
                  Get Started Today
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/schedule">Schedule a Call</Link>
                </Button>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
