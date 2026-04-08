import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export function FooterCTA() {
  return (
    <section className="bg-[#1A1410] py-16 md:py-20">
      <div className="container mx-auto px-4 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col md:flex-row items-center justify-between gap-8"
        >
          <div className="text-center md:text-left">
            <h2
              className="text-2xl md:text-3xl text-white mb-3"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Orange Door handles all of this for you
            </h2>
            <p className="text-white/40 text-sm max-w-md">
              Let's discuss your report and build a custom action plan to grow your business.
            </p>
          </div>

          <a
            href="https://orangedoorconsulting.com/schedule"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#E8521A] hover:bg-[#E8521A]/90 text-white font-semibold px-7 py-3.5 rounded-lg transition-colors shrink-0 text-sm"
          >
            Book a free strategy call
            <ArrowRight className="w-4 h-4" />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
