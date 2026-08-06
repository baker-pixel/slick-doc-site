import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Check, ArrowRight, Zap, Target, BarChart3, Star, MessageSquare, Search, FileText, Calendar } from "lucide-react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const heroImages = [
  "https://images.unsplash.com/photo-1562577309-4932fdd64cd1?w=1200&h=600&fit=crop", // SEO keyword rankings graph
  "https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=1200&h=600&fit=crop", // Social media marketing icons
  "https://images.unsplash.com/photo-1563986768494-4dee2763ff3f?w=1200&h=600&fit=crop", // Email marketing dashboard
];

const features = [
  {
    icon: Target,
    title: "Website Conversion Tune-Up",
    description: "Optimize your website's user experience and conversion paths to turn more visitors into leads.",
  },
  {
    icon: Search,
    title: "Local Visibility Upgrade",
    description: "Enhance your presence in local search results and Google Maps to capture nearby customers.",
  },
  {
    icon: FileText,
    title: "Basic SEO Cleanup",
    description: "Fix technical SEO issues, optimize meta tags, and improve your search engine rankings.",
  },
  {
    icon: Star,
    title: "Review Generation Setup",
    description: "Implement automated review request workflows to build your online reputation.",
  },
  {
    icon: BarChart3,
    title: "Analytics & KPI Setup",
    description: "Track what matters with proper analytics configuration and custom dashboards.",
  },
  {
    icon: Calendar,
    title: "Monthly GBP Posts",
    description: "Keep your Google Business Profile active with regular, engaging content.",
  },
  {
    icon: MessageSquare,
    title: "1 Blog Article/Month",
    description: "Fresh, SEO-optimized content to keep your website relevant and ranking.",
  },
  {
    icon: Search,
    title: "Quarterly SEO Tuning",
    description: "Regular optimization updates to maintain and improve your search visibility.",
  },
];

const results = [
  { metric: "30%", label: "Average increase in organic traffic" },
  { metric: "2x", label: "Improvement in lead quality" },
  { metric: "45%", label: "Boost in local search visibility" },
];

export default function TierFoundation() {
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
                <Badge className="mb-4 bg-primary/20 text-primary border-primary/30">
                  Level I • Score 65-100
                </Badge>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold text-foreground mb-4">
                  SYSTEM <span className="text-gradient">Foundation</span>
                </h1>
                <p className="text-xl text-muted-foreground mb-6">
                  For businesses with light-to-moderate gaps that need structure and optimization to reach the next level.
                </p>
                <div className="flex items-baseline gap-2 mb-8">
                  <span className="text-5xl font-bold text-foreground">$249</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <div className="flex gap-4">
                  <Button size="lg" asChild>
                    <Link to="/signup?tier=foundation">
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
                A comprehensive foundation to fix the basics and set your business up for sustainable growth.
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
                  <Card className="group h-full hover:shadow-lg hover:shadow-primary/10 transition-all duration-300 border-border hover:border-primary/30">
                    <CardContent className="pt-6">
                      <div className="relative w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors duration-300">
                        <motion.div
                          whileHover={{ scale: 1.2, rotate: 5 }}
                          transition={{ type: "spring", stiffness: 400, damping: 10 }}
                        >
                          <feature.icon className="h-6 w-6 text-primary group-hover:text-primary transition-colors" />
                        </motion.div>
                        <div className="absolute inset-0 rounded-xl bg-primary/20 opacity-0 group-hover:opacity-100 blur-md transition-opacity duration-300" />
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
                What our Foundation clients typically achieve within the first 6 months.
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
              <Zap className="h-16 w-16 text-primary mx-auto mb-6" />
              <h2 className="text-3xl sm:text-4xl font-display font-semibold text-foreground mb-4">
                Ready to Build Your Foundation?
              </h2>
              <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                Start with the essentials and see real results within weeks. No long-term risk, just proven methodology.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" asChild>
                  <Link to="/signup?tier=foundation">
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
