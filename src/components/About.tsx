import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";
import { MapPin, GraduationCap, Users, Target } from "lucide-react";

const values = [
  {
    icon: MapPin,
    title: "Locally Rooted",
    description:
      "We're not a distant agency. We're part of the East Tennessee community, serving Knox, Blount, Sevier, Anderson, Loudon, Roane, and surrounding counties.",
  },
  {
    icon: GraduationCap,
    title: "Haslam Educated",
    description:
      "Founded by two graduates of the University of Tennessee's Haslam College of Business, bringing academic rigor to practical marketing.",
  },
  {
    icon: Users,
    title: "SMB Focused",
    description:
      "We understand limited staff, limited time, and limited budgets. Our system is built for real-world business constraints.",
  },
  {
    icon: Target,
    title: "Results Driven",
    description:
      "No fluff. No gimmicks. Just a proven, repeatable system that brings order to the chaos and delivers measurable growth.",
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
              East Tennessee&apos;s Digital Marketing Partner
            </h2>
            <p className="text-muted-foreground text-lg mb-6 leading-relaxed">
              Running a small or midsize business in East Tennessee means doing
              more with less. Most owners juggle operations, sales, staffing, and
              finances—managing marketing only in the leftover hours of the week.
            </p>
            <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
              Orange Door exists to change that. We bring structure and clarity
              using a proven 6-Step Digital Marketing SYSTEM built specifically
              for SMBs—not corporations.
            </p>

            <div className="p-6 rounded-xl bg-primary/5 border border-primary/20">
              <h3 className="font-display font-semibold text-xl text-foreground mb-2">
                Our Mission
              </h3>
              <p className="text-muted-foreground italic">
                &ldquo;Give local SMBs a proven, structured, no-nonsense digital
                marketing system that finally levels the playing field.&rdquo;
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
