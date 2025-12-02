import { motion } from "framer-motion";
import { ArrowRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center pt-20 overflow-hidden bg-gradient-to-b from-cream to-background">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-0 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="container-wide mx-auto section-padding relative z-10">
        <div className="max-w-4xl">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary border border-border mb-8"
          >
            <MapPin size={16} className="text-primary" />
            <span className="text-sm font-medium text-muted-foreground">
              Proudly serving East Tennessee SMBs
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl sm:text-5xl lg:text-6xl font-display font-semibold text-foreground leading-tight mb-6"
          >
            Digital Marketing That{" "}
            <span className="text-gradient">Finally Works</span> for Small
            Business
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg sm:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed font-sans"
          >
            Stop guessing. Stop wasting money on random tactics. Orange Door
            brings a proven 6-Step SYSTEM that transforms your digital presence
            into a predictable growth engine.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4"
          >
            <Link to="/gap-analysis">
              <Button
                size="lg"
                className="bg-primary hover:bg-orange-dark text-primary-foreground text-lg px-8 py-6 shadow-glow hover:shadow-xl transition-all"
              >
                Get Your Free Gap Analysis
                <ArrowRight className="ml-2" size={20} />
              </Button>
            </Link>
            <Button
              size="lg"
              variant="outline"
              className="border-border hover:bg-secondary text-foreground text-lg px-8 py-6"
            >
              Learn About the SYSTEM
            </Button>
          </motion.div>

          {/* Social Proof */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-16 pt-8 border-t border-border"
          >
            <p className="text-sm text-muted-foreground mb-4">
              Founded by UT Haslam College of Business graduates
            </p>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-[#FF8200] flex items-center justify-center">
                  <span className="text-white font-bold text-sm">UT</span>
                </div>
                <span className="text-sm font-medium text-foreground">
                  University of Tennessee
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
