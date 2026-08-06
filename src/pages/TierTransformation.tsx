import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Check, ArrowRight, Crown, Globe, Search, Magnet, GitBranch, Handshake, Heart, BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const heroImages = [
  "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&h=600&fit=crop", // SEO performance dashboard
  "https://images.unsplash.com/photo-1611926653458-09294b3142bf?w=1200&h=600&fit=crop", // YouTube & video marketing analytics
  "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=1200&h=600&fit=crop", // PPC advertising dashboard
];

const features = [
  {
    icon: Check,
    title: "Everything in Level II",
    description: "All Foundation and Growth features as your baseline for transformation.",
    highlight: true,
  },
  {
    icon: Globe,
    title: "Full Website Rebuild",
    description: "Complete redesign and rebuild of your website for maximum conversions.",
  },
  {
    icon: Search,
    title: "Advanced SEO Program",
    description: "Comprehensive SEO strategy with advanced link building and content.",
  },
  {
    icon: Magnet,
    title: "Lead Magnet Development",
    description: "Create compelling lead magnets that capture high-intent prospects.",
  },
  {
    icon: GitBranch,
    title: "Full Funnel Buildout",
    description: "Complete marketing funnel from awareness to conversion and beyond.",
  },
  {
    icon: Handshake,
    title: "Sales Enablement System",
    description: "Tools and processes to supercharge your sales team's effectiveness.",
  },
  {
    icon: Heart,
    title: "Retention Engine Setup",
    description: "Automated systems to increase customer lifetime value and loyalty.",
  },
  {
    icon: BarChart3,
    title: "Full Analytics Suite",
    description: "Enterprise-grade analytics with custom dashboards and reporting.",
  },
];

const results = [
  { metric: "100%+", label: "Average increase in revenue" },
  { metric: "5x", label: "Return on investment" },
  { metric: "80%", label: "Reduction in customer acquisition cost" },
];

const transformationSteps = [
  { phase: "Discovery", description: "Deep dive into your business, competitors, and market opportunities." },
  { phase: "Strategy", description: "Custom roadmap designed around your specific goals and challenges." },
  { phase: "Build", description: "Complete rebuild of your digital infrastructure from the ground up." },
  { phase: "Launch", description: "Coordinated rollout with testing, optimization, and team training." },
  { phase: "Scale", description: "Continuous optimization and expansion to maximize your ROI." },
];

export default function TierTransformation() {
  const [currentImage, setCurrentImage] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImage((prev) => (prev + 1) % heroImages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />

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
                  <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">
                    Premium
                  </Badge>
                  <Badge className="bg-primary/20 text-primary border-primary/30">
                    Level III • Score 0-39
                  </Badge>
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold text-foreground mb-4">
                  SYSTEM <span className="text-gradient">Transformation</span>
                </h1>
                <p className="text-xl text-muted-foreground mb-6">
                  For businesses requiring a complete rebuild of their digital infrastructure to compete and win.
                </p>
                <div className="flex items-baseline gap-2 mb-8">
                  <span className="text-5xl font-bold text-foreground">$799</span>
                  <span className="text-2xl text-muted-foreground">–999</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <div className="flex gap-4">
                  <Button size="lg" asChild>
                    <Link to="/signup?tier=transformation">
                      Get Started
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Link>
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
                A complete digital transformation to rebuild your marketing from the ground up.
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
                  <Card className={`group h-full hover:shadow-lg hover:shadow-primary/10 transition-all duration-300 ${
                    feature.highlight 
                      ? "border-primary bg-primary/5" 
                      : "border-border hover:border-primary/30"
                  }`}>
                    <CardContent className="pt-6">
                      <div className={`relative w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors duration-300 ${
                        feature.highlight 
                          ? "bg-primary text-primary-foreground group-hover:bg-primary/90" 
                          : "bg-primary/10 group-hover:bg-primary/20"
                      }`}>
                        <motion.div
                          whileHover={{ scale: 1.2, rotate: feature.highlight ? -5 : 5 }}
                          transition={{ type: "spring", stiffness: 400, damping: 10 }}
                          className={feature.highlight ? "animate-pulse" : ""}
                        >
                          <feature.icon className={`h-6 w-6 ${feature.highlight ? "" : "text-primary"}`} />
                        </motion.div>
                        {!feature.highlight && (
                          <div className="absolute inset-0 rounded-xl bg-primary/20 opacity-0 group-hover:opacity-100 blur-md transition-opacity duration-300" />
                        )}
                        {feature.highlight && (
                          <div className="absolute inset-0 rounded-xl bg-primary opacity-0 group-hover:opacity-30 blur-lg transition-opacity duration-300" />
                        )}
                      </div>
                      <h3 className="font-semibold text-foreground mb-2 group-hover:text-primary transition-colors duration-300">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground">{feature.description}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Transformation Process */}
        <section className="py-20">
          <div className="container-wide mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl sm:text-4xl font-display font-semibold text-foreground mb-4">
                The Transformation Process
              </h2>
              <p className="text-muted-foreground">
                A structured approach to completely rebuilding your digital presence.
              </p>
            </motion.div>

            <div className="max-w-4xl mx-auto">
              {transformationSteps.map((step, index) => (
                <motion.div
                  key={step.phase}
                  initial={{ opacity: 0, x: index % 2 === 0 ? -30 : 30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="flex gap-6 mb-8 last:mb-0"
                >
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                      {index + 1}
                    </div>
                    {index < transformationSteps.length - 1 && (
                      <div className="w-0.5 h-full bg-primary/20 mt-2" />
                    )}
                  </div>
                  <div className="pb-8">
                    <h3 className="text-xl font-semibold text-foreground mb-2">{step.phase}</h3>
                    <p className="text-muted-foreground">{step.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Expected Results */}
        <section className="py-20 bg-muted/30">
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
                What our Transformation clients typically achieve within the first year.
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

        {/* CTA */}
        <section className="py-20 bg-gradient-to-br from-primary/10 to-primary/5">
          <div className="container-wide mx-auto px-4 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <Crown className="h-16 w-16 text-primary mx-auto mb-6" />
              <h2 className="text-3xl sm:text-4xl font-display font-semibold text-foreground mb-4">
                Ready for a Complete Transformation?
              </h2>
              <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                This isn't a quick fix—it's a complete rebuild designed for businesses serious about dominating their market.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" asChild>
                  <Link to="/signup?tier=transformation">
                    Get Started Today
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
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
