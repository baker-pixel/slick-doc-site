import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";
import { 
  Clock, 
  Users, 
  TrendingUp, 
  Shield, 
  Zap, 
  HeartHandshake,
  XCircle,
  CheckCircle2
} from "lucide-react";

const differentiators = [
  {
    icon: Clock,
    title: "100% Done-For-You",
    description: "No tasks. No training. No tools to learn. We handle everything while you run your business.",
  },
  {
    icon: Users,
    title: "Local Market Experts",
    description: "Founded by UT grads, we understand East Tennessee businesses and what makes your customers tick.",
  },
  {
    icon: TrendingUp,
    title: "Proven Results",
    description: "185% average growth for our clients. $8.2M in revenue generated. Real numbers, not vanity metrics.",
  },
  {
    icon: Shield,
    title: "Full Transparency",
    description: "Monthly reports show exactly what we're doing and how it's working. No smoke and mirrors.",
  },
  {
    icon: Zap,
    title: "The SYSTEM Approach",
    description: "Our 6-step methodology covers every aspect of digital marketing in one integrated solution.",
  },
  {
    icon: HeartHandshake,
    title: "True Partnership",
    description: "We're invested in your success. When you win, we win. It's that simple.",
  },
];

const comparison = [
  { us: "We do everything for you", them: "They teach you to do it yourself" },
  { us: "One integrated system", them: "Disconnected tools and vendors" },
  { us: "Transparent monthly reports", them: "Vanity metrics and confusion" },
  { us: "Local market expertise", them: "Generic national playbooks" },
  { us: "Full accountability for results", them: "Blame-shifting and excuses" },
];

export function WhyUs() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="section-padding bg-secondary/30" ref={ref}>
      <div className="container-wide mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            The Orange Door Difference
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-semibold text-foreground mb-4">
            Why Business Owners Choose Us
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            We're not another agency that gives you homework. We're your complete marketing department.
          </p>
        </motion.div>

        {/* Differentiators Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {differentiators.map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="p-6 rounded-xl bg-card border border-border hover:border-primary/50 transition-colors"
            >
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <item.icon className="text-primary" size={24} />
              </div>
              <h3 className="font-semibold text-foreground text-lg mb-2">
                {item.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {item.description}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Comparison Table */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="max-w-3xl mx-auto"
        >
          <h3 className="text-xl font-display font-semibold text-foreground text-center mb-6">
            Orange Door vs. Traditional Agencies
          </h3>
          <div className="rounded-xl overflow-hidden border border-border">
            <div className="grid grid-cols-2">
              <div className="bg-primary/10 p-4 text-center font-semibold text-foreground border-r border-border">
                Orange Door
              </div>
              <div className="bg-secondary p-4 text-center font-semibold text-muted-foreground">
                Other Agencies
              </div>
            </div>
            {comparison.map((row, index) => (
              <div key={index} className="grid grid-cols-2 border-t border-border">
                <div className="p-4 flex items-center gap-2 bg-primary/5 border-r border-border">
                  <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-sm text-foreground">{row.us}</span>
                </div>
                <div className="p-4 flex items-center gap-2 bg-card">
                  <XCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">{row.them}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
