import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";
import { MapPin, GraduationCap, Users, Target } from "lucide-react";

const values = [
  {
    icon: MapPin,
    title: "100% Done-For-You",
    description:
      "You don't lift a finger. We handle every aspect of your digital marketing—strategy, execution, optimization, and reporting.",
  },
  {
    icon: GraduationCap,
    title: "Zero Learning Curve",
    description:
      "No training required. No software to learn. No tasks on your plate. We're your complete outsourced marketing department.",
  },
  {
    icon: Users,
    title: "Built for Busy Owners",
    description:
      "You're running a business, not learning marketing. We take it completely off your hands so you can focus on what you do best.",
  },
  {
    icon: Target,
    title: "Full Accountability",
    description:
      "We own the results. Monthly reports show exactly what we're doing and how it's working. You just review the wins.",
  },
];

export function About() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="about" className="section-padding bg-background">
      <div className="container-wide mx-auto" ref={ref}>
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              About Orange Door
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-semibold text-foreground mb-6">
              Your Complete Marketing Team—Without the Headache
            </h2>
            <p className="text-muted-foreground text-lg mb-6 leading-relaxed">
              <span className="font-semibold text-foreground">You have a business to run.</span>{" "}
              You shouldn't have to become a marketing expert, manage freelancers, 
              or figure out which tools to use. That's our job—not yours.
            </p>
            <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
              Orange Door is your fully outsourced marketing department. We handle 
              everything from strategy to execution to reporting. You simply 
              watch your business grow while we do all the heavy lifting.
            </p>

            <div className="p-6 rounded-xl bg-primary/5 border border-primary/20">
              <h3 className="font-display font-semibold text-xl text-foreground mb-2">
                Our Promise
              </h3>
              <p className="text-muted-foreground italic">
                &ldquo;You focus on running your business. We handle 100% of your 
                digital marketing. No tasks. No training. No hassle.&rdquo;
              </p>
            </div>
          </motion.div>

          {/* Values Grid */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-6"
          >
            {values.map((value, index) => (
              <motion.div
                key={value.title}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
                className="p-6 rounded-xl bg-card border border-border hover:border-primary/50 transition-colors"
              >
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <value.icon className="text-primary" size={24} />
                </div>
                <h4 className="font-semibold text-foreground mb-2">
                  {value.title}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {value.description}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
