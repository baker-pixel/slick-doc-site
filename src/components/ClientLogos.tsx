import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";

const clients = [
  { name: "Knox Plumbing Pros", industry: "Home Services" },
  { name: "Smoky Mountain Dental", industry: "Healthcare" },
  { name: "Tennessee Valley Roofing", industry: "Construction" },
  { name: "Old City Fitness", industry: "Wellness" },
  { name: "Volunteer HVAC", industry: "Home Services" },
  { name: "Lakeside Legal", industry: "Professional Services" },
];

export function ClientLogos() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <section className="py-12 bg-secondary/50 border-y border-border" ref={ref}>
      <div className="container-wide mx-auto px-4 md:px-8">
        <motion.p
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center text-sm text-muted-foreground mb-8"
        >
          Trusted by local businesses across East Tennessee
        </motion.p>
        
        <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12">
          {clients.map((client, index) => (
            <motion.div
              key={client.name}
              initial={{ opacity: 0, y: 10 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className="flex flex-col items-center group"
            >
              <div className="w-16 h-16 rounded-xl bg-card border border-border flex items-center justify-center group-hover:border-primary/50 transition-colors">
                <span className="text-xl font-display font-bold text-primary">
                  {client.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                </span>
              </div>
              <span className="mt-2 text-xs text-muted-foreground whitespace-nowrap">
                {client.name}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
