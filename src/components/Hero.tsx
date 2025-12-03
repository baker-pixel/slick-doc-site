import { motion } from "framer-motion";
import { ArrowRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import logo from "@/assets/logo-transparent.png";

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center pt-20 overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-cream via-background to-secondary"
          animate={{
            backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear",
          }}
          style={{ backgroundSize: "400% 400%" }}
        />
        
        {/* Floating orbs */}
        <motion.div
          className="absolute top-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-primary/10 blur-3xl"
          animate={{
            x: [0, 100, 0],
            y: [0, -50, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] rounded-full bg-orange-light/20 blur-3xl"
          animate={{
            x: [0, -80, 0],
            y: [0, 60, 0],
            scale: [1, 0.9, 1],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 w-[300px] h-[300px] rounded-full bg-navy/5 blur-3xl"
          animate={{
            x: [0, 50, -50, 0],
            y: [0, -30, 30, 0],
          }}
          transition={{
            duration: 18,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      <div className="container-wide mx-auto section-padding relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left column - Text content */}
          <div className="max-w-xl">
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
              className="text-4xl sm:text-5xl lg:text-5xl xl:text-6xl font-display font-semibold text-foreground leading-tight mb-6"
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
              className="text-lg sm:text-xl text-muted-foreground mb-10 leading-relaxed font-sans"
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
              <a href="#system">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-border hover:bg-secondary text-foreground text-lg px-8 py-6"
                >
                  Learn About the SYSTEM
                </Button>
              </a>
            </motion.div>

            {/* Quick Assessment Link */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="text-sm text-muted-foreground mt-4"
            >
              Short on time?{" "}
              <Link
                to="/quick-assessment"
                className="text-primary hover:text-orange-dark underline underline-offset-2 transition-colors"
              >
                Take our 2-minute Quick Assessment
              </Link>
            </motion.p>

            {/* Social Proof */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="mt-12 pt-6 border-t border-border"
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

          {/* Right column - Illustration */}
          <motion.div
            initial={{ opacity: 0, x: 50, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="hidden lg:block relative"
          >
            <motion.div
              animate={{ y: [0, -15, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="relative"
            >
              <img
                src={logo}
                alt="Orange Door Marketing logo"
                className="w-full max-w-md h-auto"
              />
              {/* Decorative glow behind image */}
              <div className="absolute -inset-4 bg-primary/20 blur-3xl rounded-full -z-10" />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
