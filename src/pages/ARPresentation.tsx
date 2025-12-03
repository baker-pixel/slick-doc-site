import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronLeft, Play, Pause, Volume2, VolumeX, Search, TrendingUp, Mail, CreditCard, Heart, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

const systemSteps = [
  {
    id: 1,
    letter: "S",
    title: "Search & Visibility",
    subtitle: "Get Found",
    description: "Make sure customers can find you when they need you",
    icon: Search,
    color: "from-orange-500 to-orange-600",
    details: ["SEO Strategy", "Local SEO", "Paid Ads", "Social Presence"],
  },
  {
    id: 2,
    letter: "Y",
    title: "Yield Optimization",
    subtitle: "Convert Visitors",
    description: "Turn website visitors into real leads with clear messaging",
    icon: TrendingUp,
    color: "from-emerald-500 to-emerald-600",
    details: ["Conversion Rate", "Mobile Design", "Fast Pages", "Clear CTAs"],
  },
  {
    id: 3,
    letter: "S",
    title: "Sequence & Nurture",
    subtitle: "Warm Up Leads",
    description: "Automated follow-ups that convert curious visitors into buyers",
    icon: Mail,
    color: "from-blue-500 to-blue-600",
    details: ["Email Drips", "SMS Follow-ups", "Retargeting", "Lead Scoring"],
  },
  {
    id: 4,
    letter: "T",
    title: "Transaction Activation",
    subtitle: "Close Deals",
    description: "Speed to lead and streamlined processes that close deals",
    icon: CreditCard,
    color: "from-violet-500 to-violet-600",
    details: ["Fast Response", "Online Booking", "Easy Quotes", "Sales Tools"],
  },
  {
    id: 5,
    letter: "E",
    title: "Engagement & Retention",
    subtitle: "Build Loyalty",
    description: "Turn customers into advocates with reviews and referrals",
    icon: Heart,
    color: "from-rose-500 to-rose-600",
    details: ["Review Requests", "Loyalty Programs", "Referrals", "Win-backs"],
  },
  {
    id: 6,
    letter: "M",
    title: "Metrics & Improvement",
    subtitle: "Track & Optimize",
    description: "Data-driven decisions with clear dashboards and reporting",
    icon: BarChart3,
    color: "from-amber-500 to-amber-600",
    details: ["Analytics", "KPI Dashboards", "Attribution", "A/B Testing"],
  },
];

const slides = [
  {
    id: 0,
    type: "intro",
    title: "The SYSTEM",
    subtitle: "6-Step Growth Framework",
    description: "A complete digital marketing engine designed for small and midsize businesses",
    color: "from-primary to-primary/70",
  },
  ...systemSteps.map((step, index) => ({
    id: index + 1,
    type: "system",
    ...step,
  })),
  {
    id: 7,
    type: "outro",
    title: "Ready to Grow?",
    subtitle: "Start Your Journey",
    description: "Get your free Gap Analysis and see where you stand across all six SYSTEM areas",
    color: "from-primary to-amber-600",
  },
];

const ARPresentation = () => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const gainNodeRef = useRef<GainNode | null>(null);

  const createAmbientSound = () => {
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    
    const masterGain = audioContext.createGain();
    masterGain.gain.value = 0.12;
    masterGain.connect(audioContext.destination);
    gainNodeRef.current = masterGain;

    // Low-pass filter for warmth
    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    filter.Q.value = 0.5;
    filter.connect(masterGain);

    // Deep, warm pad frequencies (A2, E3, A3 - peaceful open fifth)
    const frequencies = [110, 164.81, 220]; 
    
    frequencies.forEach((freq, i) => {
      const osc = audioContext.createOscillator();
      const oscGain = audioContext.createGain();
      
      // Triangle waves are softer than sine
      osc.type = 'triangle';
      osc.frequency.value = freq;
      oscGain.gain.value = 0.3 - (i * 0.08);
      
      // Very slow breathing LFO
      const lfo = audioContext.createOscillator();
      const lfoGain = audioContext.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.03 + (i * 0.01); // Super slow - like breathing
      lfoGain.gain.value = 1.5;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();
      
      // Volume swell
      const volLfo = audioContext.createOscillator();
      const volLfoGain = audioContext.createGain();
      volLfo.type = 'sine';
      volLfo.frequency.value = 0.05;
      volLfoGain.gain.value = 0.1;
      volLfo.connect(volLfoGain);
      volLfoGain.connect(oscGain.gain);
      volLfo.start();
      
      osc.connect(oscGain);
      oscGain.connect(filter);
      osc.start();
      
      oscillatorsRef.current.push(osc);
    });

    // Add soft white noise for texture (like ocean)
    const noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 2, audioContext.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * 0.02;
    }
    
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;
    
    const noiseFilter = audioContext.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 400;
    
    const noiseGain = audioContext.createGain();
    noiseGain.gain.value = 0.3;
    
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSource.start();
  };

  const startPresentation = () => {
    setHasStarted(true);
    setIsAutoPlaying(true);
    createAmbientSound();
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = newMuted ? 0 : 0.15;
    }
  };

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      oscillatorsRef.current.forEach(osc => {
        try { osc.stop(); } catch (e) {}
      });
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (!isAutoPlaying) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);
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
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 overflow-hidden relative">
      {/* Start Screen - Required for audio to play */}
      {!hasStarted && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-center"
          >
            <div className="inline-flex gap-1 text-4xl md:text-6xl font-bold mb-6">
              {["S", "Y", "S", "T", "E", "M"].map((letter, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className="text-white"
                >
                  {letter}
                </motion.span>
              ))}
            </div>
            <p className="text-white/60 mb-8">Interactive Presentation</p>
            <Button
              size="lg"
              onClick={startPresentation}
              className="bg-orange-500 hover:bg-orange-600 text-lg px-8 py-6"
            >
              <Volume2 className="w-5 h-5 mr-2" />
              Tap to Start with Sound
            </Button>
          </motion.div>
        </motion.div>
      )}

      {/* Animated Background */}
      <div className="absolute inset-0">
        <motion.div
          key={currentSlide}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.2 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
          className={`absolute inset-0 bg-gradient-to-br ${slide.color}`}
        />
        
        {/* Floating particles */}
        {[...Array(15)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-white/30 rounded-full"
            initial={{
              x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 400),
              y: typeof window !== 'undefined' ? window.innerHeight + 50 : 500,
            }}
            animate={{
              y: -50,
              opacity: [0, 0.6, 0],
            }}
            transition={{
              duration: 8 + Math.random() * 4,
              repeat: Infinity,
              delay: Math.random() * 5,
              ease: "linear",
            }}
          />
        ))}

        {/* Gentle waves */}
        <svg className="absolute bottom-0 left-0 w-full opacity-10" viewBox="0 0 1440 320">
          <motion.path
            fill="currentColor"
            className="text-white"
            animate={{
              d: [
                "M0,160L48,176C96,192,192,224,288,213.3C384,203,480,149,576,138.7C672,128,768,160,864,181.3C960,203,1056,213,1152,197.3C1248,181,1344,139,1392,117.3L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z",
                "M0,192L48,181.3C96,171,192,149,288,160C384,171,480,213,576,218.7C672,224,768,192,864,165.3C960,139,1056,117,1152,128C1248,139,1344,181,1392,202.7L1440,224L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z",
              ],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              repeatType: "reverse",
              ease: "easeInOut",
            }}
          />
        </svg>
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex gap-1 flex-1 mr-4">
            {slides.map((_, i) => (
              <motion.div
                key={i}
                className="h-1 flex-1 rounded-full bg-white/20 overflow-hidden cursor-pointer"
                onClick={() => {
                  setCurrentSlide(i);
                  setIsAutoPlaying(false);
                }}
              >
                <motion.div
                  className="h-full bg-white"
                  initial={{ width: 0 }}
                  animate={{
                    width: i < currentSlide ? "100%" : i === currentSlide ? "100%" : "0%",
                  }}
                  transition={{
                    duration: i === currentSlide && isAutoPlaying ? 5 : 0.3,
                  }}
                />
              </motion.div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            className="text-white/70 hover:text-white hover:bg-white/10"
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </Button>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide}
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -30, scale: 0.95 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="text-center max-w-lg"
            >
              {slide.type === "intro" && (
                <>
                  <motion.div
                    initial={{ scale: 0, rotate: -10 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 150 }}
                    className="mb-8"
                  >
                    <div className="inline-flex gap-1 text-5xl md:text-7xl font-bold">
                      {["S", "Y", "S", "T", "E", "M"].map((letter, i) => (
                        <motion.span
                          key={i}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3 + i * 0.1 }}
                          className="text-white"
                        >
                          {letter}
                        </motion.span>
                      ))}
                    </div>
                  </motion.div>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    className="text-2xl text-orange-400 font-medium mb-4"
                  >
                    {slide.subtitle}
                  </motion.p>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1 }}
                    className="text-white/70 text-lg"
                  >
                    {slide.description}
                  </motion.p>
                </>
              )}

              {slide.type === "system" && "letter" in slide && (
                <>
                  {/* Letter Badge */}
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                    className={`w-24 h-24 md:w-32 md:h-32 rounded-3xl bg-gradient-to-br ${slide.color} mx-auto mb-6 flex items-center justify-center shadow-2xl`}
                  >
                    <span className="text-5xl md:text-6xl font-bold text-white">{slide.letter}</span>
                  </motion.div>

                  {/* Icon */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="mb-4"
                  >
                    {slide.icon && <slide.icon className="w-8 h-8 text-white/50 mx-auto" />}
                  </motion.div>

                  {/* Title */}
                  <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="text-3xl md:text-4xl font-bold text-white mb-2"
                  >
                    {slide.title}
                  </motion.h1>

                  {/* Subtitle */}
                  <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="text-xl text-orange-400 font-medium mb-4"
                  >
                    {slide.subtitle}
                  </motion.p>

                  {/* Description */}
                  <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="text-white/70 text-lg mb-8"
                  >
                    {slide.description}
                  </motion.p>

                  {/* Details */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.7 }}
                    className="flex flex-wrap justify-center gap-2"
                  >
                    {slide.details?.map((detail, i) => (
                      <motion.span
                        key={detail}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.8 + i * 0.1 }}
                        className="px-4 py-2 bg-white/10 backdrop-blur-sm text-white/90 rounded-full text-sm font-medium border border-white/10"
                      >
                        {detail}
                      </motion.span>
                    ))}
                  </motion.div>
                </>
              )}

              {slide.type === "outro" && (
                <>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: "spring" }}
                    className="text-6xl mb-6"
                  >
                    🚀
                  </motion.div>
                  <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-3xl md:text-5xl font-bold text-white mb-4"
                  >
                    {slide.title}
                  </motion.h1>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-white/70 text-lg mb-8"
                  >
                    {slide.description}
                  </motion.p>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.7 }}
                  >
                    <Button
                      size="lg"
                      className="text-lg px-8 bg-orange-500 hover:bg-orange-600"
                      onClick={() => (window.location.href = "/gap-analysis")}
                    >
                      Free Gap Analysis
                    </Button>
                    <p className="text-sm text-white/50 mt-4">orangedoormarketing.com</p>
                  </motion.div>
                </>
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
            className="rounded-full text-white/70 hover:text-white hover:bg-white/10"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsAutoPlaying(!isAutoPlaying)}
            className="rounded-full text-white/70 hover:text-white hover:bg-white/10"
          >
            {isAutoPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={nextSlide}
            className="rounded-full text-white/70 hover:text-white hover:bg-white/10"
          >
            <ChevronRight className="w-6 h-6" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ARPresentation;
