import { motion } from "framer-motion";
import { ScoreDial } from "./ScoreDial";
import { getGradeBadge } from "./ReportConfig";

interface CoverSectionProps {
  clientDomain: string;
  reportDate: string;
  overallScore: number;
}

export function CoverSection({ clientDomain, reportDate, overallScore }: CoverSectionProps) {
  const badge = getGradeBadge(overallScore);

  return (
    <section className="relative bg-[#1A1410] overflow-hidden py-20 md:py-28">
      {/* Decorative blurred circles */}
      <div className="absolute top-[-80px] right-[-60px] w-[300px] h-[300px] rounded-full bg-[#E8521A]/10 blur-[100px]" />
      <div className="absolute bottom-[-100px] left-[-80px] w-[250px] h-[250px] rounded-full bg-[#E8521A]/5 blur-[80px]" />

      <div className="container mx-auto px-4 max-w-4xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="text-center space-y-8"
        >
          {/* Orange Door wordmark */}
          <p className="text-[#E8521A] tracking-[0.3em] uppercase text-sm font-medium">
            Orange Door
          </p>

          {/* Title */}
          <h1
            className="text-4xl md:text-5xl lg:text-6xl text-white leading-tight"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            Marketing Gap Analysis
          </h1>

          {/* Client domain */}
          <p className="text-white/50 text-lg md:text-xl tracking-wide">
            {clientDomain}
          </p>

          {/* Score dial */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="flex justify-center pt-4"
          >
            <ScoreDial score={overallScore} size={200} />
          </motion.div>

          {/* Badge */}
          <div className="flex justify-center">
            <span className="inline-block px-5 py-2 rounded-full border border-[#E8521A]/30 text-[#E8521A] text-sm font-medium tracking-wide">
              {badge}
            </span>
          </div>

          {/* Date */}
          <p className="text-white/30 text-sm">{reportDate}</p>
        </motion.div>
      </div>
    </section>
  );
}
