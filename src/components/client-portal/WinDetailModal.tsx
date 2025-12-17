import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Trophy, 
  TrendingUp, 
  DollarSign, 
  Target,
  Star,
  Users,
  Search,
  Sparkles,
  PartyPopper,
  Rocket,
  Zap,
  CheckCircle2,
  ArrowUpRight
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

interface Notification {
  id: string;
  notification_type: string;
  title: string;
  description: string | null;
  metric: string | null;
  metric_value: string | null;
  is_positive: boolean;
  priority: string;
  is_read: boolean;
  created_at: string;
}

interface WinDetailModalProps {
  notification: Notification | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Confetti particle component
const ConfettiParticle = ({ delay, x }: { delay: number; x: number }) => {
  const colors = ["#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8"];
  const color = colors[Math.floor(Math.random() * colors.length)];
  
  return (
    <motion.div
      className="absolute w-3 h-3 rounded-sm"
      style={{ backgroundColor: color, left: `${x}%` }}
      initial={{ y: -20, opacity: 1, rotate: 0, scale: 1 }}
      animate={{ 
        y: 400, 
        opacity: 0, 
        rotate: Math.random() * 720 - 360,
        scale: 0,
        x: (Math.random() - 0.5) * 200
      }}
      transition={{ 
        duration: 2 + Math.random(), 
        delay,
        ease: "easeOut"
      }}
    />
  );
};

// Star burst component
const StarBurst = ({ delay }: { delay: number }) => (
  <motion.div
    className="absolute"
    style={{ 
      left: `${20 + Math.random() * 60}%`, 
      top: `${20 + Math.random() * 60}%` 
    }}
    initial={{ scale: 0, opacity: 0 }}
    animate={{ scale: [0, 1.5, 0], opacity: [0, 1, 0] }}
    transition={{ duration: 0.8, delay }}
  >
    <Sparkles className="h-6 w-6 text-yellow-400" />
  </motion.div>
);

export default function WinDetailModal({ notification, open, onOpenChange }: WinDetailModalProps) {
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (open && notification) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [open, notification]);

  if (!notification) return null;

  const getTypeIcon = (type: string) => {
    const iconProps = { className: "h-8 w-8" };
    switch (type) {
      case "ranking": return <Search {...iconProps} />;
      case "traffic": return <TrendingUp {...iconProps} />;
      case "cost": return <DollarSign {...iconProps} />;
      case "conversion": return <Target {...iconProps} />;
      case "review": return <Star {...iconProps} />;
      case "lead": return <Users {...iconProps} />;
      default: return <Trophy {...iconProps} />;
    }
  };

  const getTypeGradient = (type: string) => {
    switch (type) {
      case "ranking": return "from-purple-500 to-purple-700";
      case "traffic": return "from-blue-500 to-blue-700";
      case "cost": return "from-green-500 to-green-700";
      case "conversion": return "from-orange-500 to-orange-700";
      case "review": return "from-yellow-500 to-yellow-600";
      case "lead": return "from-pink-500 to-pink-700";
      default: return "from-primary to-primary/80";
    }
  };

  const getTypeMessage = (type: string) => {
    switch (type) {
      case "ranking": return "Your visibility is growing!";
      case "traffic": return "More people are finding you!";
      case "cost": return "Your efficiency is improving!";
      case "conversion": return "Your marketing is working!";
      case "review": return "Your reputation is growing!";
      case "lead": return "New opportunities await!";
      default: return "Keep up the great work!";
    }
  };

  const getEmoji = (type: string) => {
    switch (type) {
      case "ranking": return "🚀";
      case "traffic": return "📈";
      case "cost": return "💰";
      case "conversion": return "🎯";
      case "review": return "⭐";
      case "lead": return "🤝";
      default: return "🏆";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden border-0 bg-transparent">
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="relative"
            >
              {/* Confetti container */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
                {showConfetti && [...Array(30)].map((_, i) => (
                  <ConfettiParticle key={i} delay={i * 0.05} x={Math.random() * 100} />
                ))}
                {showConfetti && [...Array(8)].map((_, i) => (
                  <StarBurst key={`star-${i}`} delay={0.2 + i * 0.15} />
                ))}
              </div>

              {/* Main content */}
              <div className="bg-card rounded-xl overflow-hidden shadow-2xl">
                {/* Header with gradient */}
                <motion.div 
                  className={`bg-gradient-to-br ${getTypeGradient(notification.notification_type)} p-6 text-white relative overflow-hidden`}
                  initial={{ y: -20 }}
                  animate={{ y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  {/* Animated background elements */}
                  <motion.div
                    className="absolute inset-0 opacity-20"
                    animate={{ 
                      backgroundPosition: ["0% 0%", "100% 100%"],
                    }}
                    transition={{ duration: 3, repeat: Infinity, repeatType: "reverse" }}
                    style={{
                      backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
                      backgroundSize: "20px 20px"
                    }}
                  />
                  
                  <div className="relative z-10 flex items-center justify-between">
                    <div>
                      <motion.div 
                        className="text-5xl mb-2"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                      >
                        {getEmoji(notification.notification_type)}
                      </motion.div>
                      <Badge variant="secondary" className="bg-white/20 text-white border-0">
                        {notification.notification_type.toUpperCase()} WIN
                      </Badge>
                    </div>
                    <motion.div
                      className="p-4 bg-white/20 rounded-full backdrop-blur-sm"
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 0.5, delay: 0.4 }}
                    >
                      {getTypeIcon(notification.notification_type)}
                    </motion.div>
                  </div>
                </motion.div>

                {/* Content */}
                <div className="p-6 space-y-6">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <h2 className="text-2xl font-bold mb-2">{notification.title}</h2>
                    <p className="text-muted-foreground">
                      {notification.description || "Great progress on your marketing goals!"}
                    </p>
                  </motion.div>

                  {/* Metric highlight */}
                  {notification.metric && notification.metric_value && (
                    <motion.div
                      className="bg-muted/50 rounded-xl p-4 border"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3 }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground font-medium uppercase tracking-wide">
                            {notification.metric}
                          </p>
                          <motion.p 
                            className="text-3xl font-bold text-primary"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.5 }}
                          >
                            {notification.is_positive && "+"}
                            {notification.metric_value}
                          </motion.p>
                        </div>
                        <motion.div
                          animate={{ y: [0, -5, 0] }}
                          transition={{ duration: 1, repeat: Infinity }}
                        >
                          <ArrowUpRight className="h-8 w-8 text-green-500" />
                        </motion.div>
                      </div>
                    </motion.div>
                  )}

                  {/* Motivational message */}
                  <motion.div
                    className="flex items-center gap-3 p-4 bg-gradient-to-r from-primary/10 to-primary/5 rounded-xl"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <motion.div
                      animate={{ rotate: [0, 15, -15, 0] }}
                      transition={{ duration: 1, repeat: Infinity, repeatDelay: 2 }}
                    >
                      <PartyPopper className="h-6 w-6 text-primary" />
                    </motion.div>
                    <p className="font-medium text-primary">
                      {getTypeMessage(notification.notification_type)}
                    </p>
                  </motion.div>

                  {/* Date */}
                  <motion.p 
                    className="text-xs text-muted-foreground text-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                  >
                    Achieved on {new Date(notification.created_at).toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </motion.p>

                  {/* Close button */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                  >
                    <Button 
                      className="w-full" 
                      size="lg"
                      onClick={() => onOpenChange(false)}
                    >
                      <CheckCircle2 className="h-5 w-5 mr-2" />
                      Celebrate & Close
                    </Button>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
