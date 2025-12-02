import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";
import { ArrowRight, Mail, Phone, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Contact() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="contact" className="section-padding bg-accent text-accent-foreground">
      <div className="container-wide mx-auto" ref={ref}>
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20">
          {/* CTA Content */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-semibold mb-6">
              Ready to Stop Guessing and{" "}
              <span className="text-primary">Start Growing?</span>
            </h2>
            <p className="text-accent-foreground/70 text-lg mb-8 leading-relaxed">
              Get your free SYSTEM Gap Analysis. We&apos;ll audit your digital
              presence, identify your biggest opportunities, and show you exactly
              how to level up your marketing.
            </p>

            <div className="space-y-4 mb-8">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                  <Mail className="text-primary" size={20} />
                </div>
                <span className="text-accent-foreground/90">
                  hello@orangedoor.marketing
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                  <Phone className="text-primary" size={20} />
                </div>
                <span className="text-accent-foreground/90">(865) 555-DOOR</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                  <MapPin className="text-primary" size={20} />
                </div>
                <span className="text-accent-foreground/90">
                  Knoxville, Tennessee
                </span>
              </div>
            </div>
          </motion.div>

          {/* Form */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="bg-card rounded-2xl p-8 text-card-foreground"
          >
            <h3 className="text-2xl font-display font-semibold mb-6">
              Get Your Free Gap Analysis
            </h3>
            <form className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    First Name
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="John"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Last Name
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Smith"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Business Name
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Your Business LLC"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="john@yourbusiness.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Website URL (optional)
                </label>
                <input
                  type="url"
                  className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="https://yourbusiness.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  What&apos;s your biggest marketing challenge?
                </label>
                <textarea
                  rows={3}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                  placeholder="Tell us what's not working..."
                />
              </div>
              <Button className="w-full bg-primary hover:bg-orange-dark text-primary-foreground py-6 text-lg">
                Request My Free Analysis
                <ArrowRight className="ml-2" size={20} />
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Takes 10-15 minutes. No obligation. 100% free.
              </p>
            </form>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
