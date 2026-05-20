import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { getClientPortalOrigin } from "@/lib/getPortalUrl";

export function ClientLoginCTA() {
  return (
    <section className="section-padding bg-secondary/30">
      <div className="container-wide mx-auto px-4 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-foreground to-foreground/90 p-10 md:p-16 text-center shadow-xl"
        >
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-orange-light/10 blur-3xl" />

          <div className="relative z-10 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-background/10 backdrop-blur border border-background/20 mb-6">
              <LockKeyhole size={16} className="text-primary" />
              <span className="text-sm font-medium text-background">Client Portal Access</span>
            </div>

            <h2 className="text-3xl md:text-5xl font-display font-semibold text-background mb-4">
              Already a client? <span className="text-primary">Sign in.</span>
            </h2>
            <p className="text-lg text-background/80 mb-8 leading-relaxed">
              Track your campaigns, approve content, view reports, and chat with
              your team — all from your private dashboard.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href={`${getClientPortalOrigin()}/portal/auth`} className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="w-full sm:w-auto bg-primary hover:bg-orange-dark text-primary-foreground text-base px-8 py-6"
                >
                  Sign In
                  <ArrowRight className="ml-2" size={18} />
                </Button>
              </a>
              <Link to="/pricing" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto bg-transparent border-background/30 text-background hover:bg-background/10 text-base px-8 py-6"
                >
                  Sign Up
                </Button>
              </Link>
            </div>

            <p className="text-sm text-background/60 mt-6">
              Not a client yet?{" "}
              <Link to="/gap-analysis" className="text-primary hover:underline">
                Start with a free Gap Analysis
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}