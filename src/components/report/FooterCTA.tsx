import { motion } from "framer-motion";

export function FooterCTA() {
  return (
    <section className="bg-[#F7F8FA] px-10 py-12 md:px-14">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="max-w-3xl"
      >
        <div className="bg-[#F0F1F3] border border-[rgba(0,0,0,0.08)] rounded-xl px-8 py-7 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h2
              style={{ fontFamily: "'DM Serif Display', serif" }}
              className="text-[22px] text-[#1A1D23] leading-[1.3] mb-1"
            >
              Ready to close the gaps?
            </h2>
            <p className="text-[13px] text-[#4A4F5C]">
              Book a free 30-minute strategy call and let's build your path to 95+.
            </p>
          </div>

          <a
            href="https://orangedoormarketing.com/schedule"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#0F6E56] hover:bg-[#0a4f3e] text-[#E1F5EE] text-[13px] font-semibold tracking-[0.02em] px-7 py-3.5 rounded-lg transition-colors shrink-0"
          >
            Schedule a call →
          </a>
        </div>
      </motion.div>
    </section>
  );
}
