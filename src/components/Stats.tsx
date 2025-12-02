import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";

const stats = [
  {
    value: "87%",
    label: "of customers start buying online",
    source: "Google, 2023",
  },
  {
    value: "76%",
    label: "of local searches lead to a visit within 24 hours",
    source: "Google Local Behavior Study",
  },
  {
    value: "2-3x",
    label: "faster growth for SMBs with strong digital presence",
    source: "Bain & Company",
  },
  {
    value: "70%",
    label: "of SMB owners say digital marketing is their #1 challenge",
    source: "HubSpot SMB Insights",
  },
];

export function Stats() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="section-padding bg-accent text-accent-foreground">
      <div className="container-wide mx-auto" ref={ref}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-display font-semibold mb-4">
            Why Digital Marketing Matters
          </h2>
          <p className="text-accent-foreground/70 max-w-2xl mx-auto">
            Your customers are online. The question is: can they find you?
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="text-center p-6"
            >
              <div className="text-4xl sm:text-5xl font-display font-bold text-primary mb-3">
                {stat.value}
              </div>
              <p className="text-accent-foreground/90 mb-2">{stat.label}</p>
              <p className="text-xs text-accent-foreground/50">{stat.source}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
