import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronLeft, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";

const slides = [
  {
    id: 1,
    title: "Orange Door Marketing",
    subtitle: "Your Growth Partner",
    description: "Full-service digital marketing agency in Knoxville, TN",
    icon: "🚀",
    color: "from-primary to-primary/70",
  },
  {
    id: 2,
    title: "The SYSTEM",
    subtitle: "Strategic Framework",
    description: "Our proven 7-pillar approach to sustainable growth",
    icon: "⚙️",
    color: "from-blue-500 to-blue-700",
    pillars: ["SEO", "Yield Optimization", "Social Media", "Trust Building", "Email Marketing", "Metrics"],
  },
  {
    id: 3,
    title: "SEO & Visibility",
    subtitle: "Get Found Online",
    description: "Dominate search results and attract qualified leads",
    icon: "🔍",
    color: "from-green-500 to-green-700",
    stats: ["300% Traffic Increase", "Top 3 Rankings", "Local SEO Mastery"],
  },
  {
    id: 4,
    title: "Paid Advertising",
    subtitle: "Maximize ROI",
    description: "Strategic ad campaigns that convert browsers to buyers",
    icon: "📈",
    color: "from-purple-500 to-purple-700",
    stats: ["Google Ads", "Social Ads", "Retargeting"],
  },
  {
    id: 5,
    title: "Website & Conversion",
    subtitle: "Turn Visitors into Customers",
    description: "High-converting websites designed for results",
    icon: "💻",
    color: "from-cyan-500 to-cyan-700",
    stats: ["UX Design", "A/B Testing", "Speed Optimization"],
  },
  {
    id: 6,
    title: "Let's Connect",
    subtitle: "Start Your Growth Journey",
    description: "Schedule a free gap analysis today",
    icon: "🤝",
    color: "from-primary to-amber-600",
    cta: true,
  },
];

const ARPresentation = () => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  useEffect(() => {
    if (!isAutoPlaying) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [isAutoPlaying]);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
    setIsAutoPlaying(false);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
    setIsAutoPlaying(false);
  };

  const slide = slides[currentSlide];

  return (
    <div className="min-h-screen bg-background overflow-hidden relative">
      {/* Animated Background */}
      <div className="absolute inset-0">
        <motion.div
          key={currentSlide}
          initial={{ opacity: 0, scale: 1.2 }}
          animate={{ opacity: 0.15, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          className={`absolute inset-0 bg-gradient-to-br ${slide.color}`}
        />
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 bg-primary/20 rounded-full"
            initial={{ 
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
              scale: 0
            }}
            animate={{
              y: [null, Math.random() * -200],
              scale: [0, 1, 0],
              opacity: [0, 0.5, 0],
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Progress Bar */}
        <div className="flex gap-1 p-4">
          {slides.map((_, i) => (
            <motion.div
              key={i}
              className="h-1 flex-1 rounded-full bg-muted overflow-hidden cursor-pointer"
              onClick={() => {
                setCurrentSlide(i);
                setIsAutoPlaying(false);
              }}
            >
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ 
                  width: i < currentSlide ? "100%" : i === currentSlide ? "100%" : "0%"
                }}
                transition={{ 
                  duration: i === currentSlide && isAutoPlaying ? 4 : 0.3
                }}
              />
            </motion.div>
          ))}
        </div>

        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide}
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -50, scale: 0.9 }}
              transition={{ duration: 0.5 }}
              className="text-center max-w-lg"
            >
              {/* Icon */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="text-6xl md:text-8xl mb-6"
              >
                {slide.icon}
              </motion.div>

              {/* Title */}
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-3xl md:text-5xl font-bold text-foreground mb-2"
              >
                {slide.title}
              </motion.h1>

              {/* Subtitle */}
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-xl md:text-2xl text-primary font-medium mb-4"
              >
                {slide.subtitle}
              </motion.p>

              {/* Description */}
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="text-muted-foreground text-lg mb-8"
              >
                {slide.description}
              </motion.p>

              {/* Pillars */}
              {slide.pillars && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="flex flex-wrap justify-center gap-2"
                >
                  {slide.pillars.map((pillar, i) => (
                    <motion.span
                      key={pillar}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.7 + i * 0.1 }}
                      className="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium"
                    >
                      {pillar}
                    </motion.span>
                  ))}
                </motion.div>
              )}

              {/* Stats */}
              {slide.stats && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="flex flex-wrap justify-center gap-3"
                >
                  {slide.stats.map((stat, i) => (
                    <motion.div
                      key={stat}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.7 + i * 0.15 }}
                      className="px-4 py-3 bg-card border border-border rounded-xl"
                    >
                      <span className="text-foreground font-semibold">{stat}</span>
                    </motion.div>
                  ))}
                </motion.div>
              )}

              {/* CTA */}
              {slide.cta && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6 }}
                  className="space-y-4"
                >
                  <Button
                    size="lg"
                    className="text-lg px-8"
                    onClick={() => window.location.href = "/gap-analysis"}
                  >
                    Free Gap Analysis
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    orangedoormarketing.com
                  </p>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Controls */}
        <div className="p-6 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={prevSlide}
            className="rounded-full"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsAutoPlaying(!isAutoPlaying)}
            className="rounded-full"
          >
            {isAutoPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={nextSlide}
            className="rounded-full"
          >
            <ChevronRight className="w-6 h-6" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ARPresentation;
