import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { motion } from "framer-motion";
import { MapPin, GraduationCap, Users, Target, Heart, Award, Lightbulb, Handshake, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const values = [
  {
    icon: MapPin,
    title: "Locally Rooted",
    description:
      "We're not a distant agency. We're part of the East Tennessee community, serving Knox, Blount, Sevier, Anderson, Loudon, Roane, and surrounding counties. We understand the local market because we live and work here.",
  },
  {
    icon: GraduationCap,
    title: "Haslam Educated",
    description:
      "Founded by two graduates of the University of Tennessee's Haslam College of Business, bringing academic rigor to practical marketing. We combine proven business frameworks with real-world experience.",
  },
  {
    icon: Users,
    title: "SMB Focused",
    description:
      "We understand limited staff, limited time, and limited budgets. Our system is built for real-world business constraints, not Fortune 500 companies with unlimited resources.",
  },
  {
    icon: Target,
    title: "Results Driven",
    description:
      "No fluff. No gimmicks. Just a proven, repeatable system that brings order to the chaos and delivers measurable growth you can track and understand.",
  },
];

const principles = [
  {
    icon: Heart,
    title: "Relationships First",
    description: "We build lasting partnerships, not one-off transactions. Your success is our success.",
  },
  {
    icon: Lightbulb,
    title: "Clarity Over Complexity",
    description: "Marketing doesn't have to be confusing. We make it simple, transparent, and actionable.",
  },
  {
    icon: Award,
    title: "Excellence in Execution",
    description: "We don't just strategize—we implement. Every detail matters in the pursuit of results.",
  },
  {
    icon: Handshake,
    title: "Honest Communication",
    description: "We'll tell you what's working and what isn't. No sugar-coating, just straight talk.",
  },
];

const AboutUs = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pt-20">
        {/* Hero */}
        <section className="section-padding bg-gradient-to-b from-cream to-background">
          <div className="container-wide mx-auto">
            <div className="mb-4">
              <BackButton />
            </div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-4xl mx-auto text-center"
            >
              <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
                About Orange Door
              </span>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-semibold text-foreground mb-6">
                East Tennessee&apos;s Digital Marketing Partner
              </h1>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                We help small and midsize businesses grow through structured, 
                results-driven digital marketing—without the corporate overhead or agency fluff.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Our Story */}
        <section className="section-padding">
          <div className="container-wide mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
              >
                <h2 className="text-3xl sm:text-4xl font-display font-semibold text-foreground mb-6">
                  Our Story
                </h2>
                <div className="space-y-4 text-muted-foreground text-lg leading-relaxed">
                  <p>
                    Running a small or midsize business in East Tennessee means doing more with less. 
                    Most owners juggle operations, sales, staffing, and finances—managing marketing 
                    only in the leftover hours of the week.
                  </p>
                  <p>
                    We've seen it firsthand: talented business owners struggling to compete online 
                    because they don't have a dedicated marketing team or the budget for a big agency. 
                    They try a little of everything—social media here, some ads there, maybe SEO—but 
                    nothing seems to stick.
                  </p>
                  <p>
                    <strong className="text-foreground">Orange Door was founded to change that.</strong> As UT Haslam College of Business 
                    graduates, we knew there had to be a better way. We developed the SYSTEM framework: 
                    a proven 6-step digital marketing methodology built specifically for SMBs—not corporations.
                  </p>
                  <p>
                    The name "Orange Door" represents opportunity and transformation. When you open 
                    that door, you're stepping into a new chapter of growth for your business.
                  </p>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="bg-primary/5 border border-primary/20 rounded-2xl p-8"
              >
                <h3 className="font-display font-semibold text-2xl text-foreground mb-4">
                  Our Mission
                </h3>
                <p className="text-muted-foreground text-lg italic mb-6">
                  "Give local SMBs a proven, structured, no-nonsense digital marketing system 
                  that finally levels the playing field."
                </p>
                <div className="border-t border-primary/20 pt-6">
                  <h4 className="font-semibold text-foreground mb-2">Our Vision</h4>
                  <p className="text-muted-foreground">
                    To become East Tennessee's most trusted growth partner for small and midsize 
                    businesses, helping them thrive in an increasingly digital world.
                  </p>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Values */}
        <section className="section-padding bg-muted/30">
          <div className="container-wide mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl sm:text-4xl font-display font-semibold text-foreground mb-4">
                What Sets Us Apart
              </h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                We're not just another marketing agency. Here's why local businesses choose Orange Door.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {values.map((value, index) => (
                <motion.div
                  key={value.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="p-6 rounded-xl bg-card border border-border hover:border-primary/50 transition-colors"
                >
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <value.icon className="text-primary" size={24} />
                  </div>
                  <h4 className="font-semibold text-foreground mb-2">{value.title}</h4>
                  <p className="text-sm text-muted-foreground">{value.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Guiding Principles */}
        <section className="section-padding">
          <div className="container-wide mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl sm:text-4xl font-display font-semibold text-foreground mb-4">
                Our Guiding Principles
              </h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                These principles guide every decision we make and every client relationship we build.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {principles.map((principle, index) => (
                <motion.div
                  key={principle.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="flex gap-4"
                >
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <principle.icon className="text-primary" size={20} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-1">{principle.title}</h4>
                    <p className="text-muted-foreground">{principle.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Service Area */}
        <section className="section-padding">
          <div className="container-wide mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-3xl mx-auto text-center"
            >
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <MapPin className="text-primary" size={32} />
              </div>
              <h2 className="text-3xl sm:text-4xl font-display font-semibold text-foreground mb-4">
                Proudly Serving East Tennessee
              </h2>
              <p className="text-muted-foreground text-lg mb-8">
                We're proud to serve small and midsize businesses across East Tennessee, including:
              </p>
              <div className="flex flex-wrap justify-center gap-3 mb-8">
                {["Knox County", "Blount County", "Sevier County", "Anderson County", "Loudon County", "Roane County", "Jefferson County", "Union County"].map((county) => (
                  <span
                    key={county}
                    className="px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium"
                  >
                    {county}
                  </span>
                ))}
              </div>
              <p className="text-muted-foreground">
                And the surrounding areas throughout the region.
              </p>
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="section-padding bg-primary/5 border-y border-primary/20">
          <div className="container-wide mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center max-w-2xl mx-auto"
            >
              <h2 className="text-3xl sm:text-4xl font-display font-semibold text-foreground mb-4">
                Ready to Open the Door to Growth?
              </h2>
              <p className="text-muted-foreground text-lg mb-8">
                Take our free Gap Analysis to discover where your marketing is leaking opportunity—and 
                how we can help you fix it.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild size="lg">
                  <Link to="/gap-analysis">
                    Get Your Free Gap Analysis
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
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
};

export default AboutUs;
