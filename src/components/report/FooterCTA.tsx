import { motion } from "framer-motion";

export function FooterCTA() {
  return (
    <section className="bg-[#1A1410] px-10 py-12 md:px-14">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="max-w-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
      >
        <div>
          <p
            style={{ fontFamily: "'DM Serif Display', serif" }}
            className="text-[22px] text-white font-normal mb-1.5"
          >
            Orange Door handles all of this for you.
          </p>
          <p className="text-white/55 text-[13px]">
            Your dedicated marketing team — ready to implement every recommendation above.
          </p>
        </div>

        <a
          href="https://orangedoorconsulting.com/schedule"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block bg-[#E8521A] hover:bg-[#E8521A]/90 text-white text-[13px] font-semibold tracking-[0.02em] px-7 py-3.5 rounded-lg transition-colors shrink-0"
        >
          Book a free strategy call →
        </a>
      </motion.div>
    </section>
  );
}
