import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// Voice command mappings
const VOICE_COMMANDS: { patterns: string[]; route: string; response: string }[] = [
  { patterns: ["pricing", "prices", "cost", "how much"], route: "/pricing", response: "Taking you to pricing" },
  { patterns: ["about", "about us", "who are you", "learn more"], route: "/about", response: "Opening about page" },
  { patterns: ["schedule", "book", "call", "consultation", "talk"], route: "/schedule", response: "Let's schedule a call" },
  { patterns: ["gap analysis", "full analysis", "assessment"], route: "/gap-analysis", response: "Starting gap analysis" },
  { patterns: ["quick analysis", "website check", "audit", "scan"], route: "/quick-analysis", response: "Opening quick analysis" },
  { patterns: ["system", "methodology", "how it works", "process"], route: "/system", response: "Showing the SYSTEM" },
  { patterns: ["home", "start", "beginning", "main"], route: "/", response: "Going home" },
];

interface SpeechRecognitionType extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: { resultIndex: number; results: { [index: number]: { [index: number]: { transcript: string }; isFinal: boolean } } }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

export const VoiceNavigation = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(true);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const recognitionRef = useRef<SpeechRecognitionType | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Check for browser support
  useEffect(() => {
    const SpeechRecognitionAPI = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionType; webkitSpeechRecognition?: new () => SpeechRecognitionType }).SpeechRecognition || 
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionType }).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setIsSupported(false);
    }
  }, []);

  const processCommand = useCallback((text: string) => {
    const lowerText = text.toLowerCase();
    
    for (const command of VOICE_COMMANDS) {
      for (const pattern of command.patterns) {
        if (lowerText.includes(pattern)) {
          setFeedbackText(command.response);
          setShowFeedback(true);
          
          // Speak the response
          if ("speechSynthesis" in window) {
            const utterance = new SpeechSynthesisUtterance(command.response);
            utterance.rate = 1.1;
            utterance.pitch = 1;
            window.speechSynthesis.speak(utterance);
          }
          
          // Navigate after brief delay
          setTimeout(() => {
            navigate(command.route);
            setShowFeedback(false);
          }, 1000);
          
          return true;
        }
      }
    }
    
    // No command matched
    setFeedbackText("Try saying: pricing, about, schedule, or analysis");
    setShowFeedback(true);
    setTimeout(() => setShowFeedback(false), 3000);
    return false;
  }, [navigate]);

  const startListening = useCallback(() => {
    const SpeechRecognitionAPI = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionType; webkitSpeechRecognition?: new () => SpeechRecognitionType }).SpeechRecognition || 
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionType }).webkitSpeechRecognition;
    
    if (!SpeechRecognitionAPI) {
      toast({
        title: "Not Supported",
        description: "Voice navigation is not supported in this browser.",
        variant: "destructive",
      });
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
      setTranscript("");
      setFeedbackText("Listening...");
      setShowFeedback(true);
    };

    recognition.onresult = (event) => {
      const current = event.resultIndex;
      const result = event.results[current];
      const text = result[0].transcript;
      setTranscript(text);
      
      if (result.isFinal) {
        processCommand(text);
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      setShowFeedback(false);
      
      if (event.error === "not-allowed") {
        toast({
          title: "Microphone Access Needed",
          description: "Please allow microphone access to use voice navigation.",
          variant: "destructive",
        });
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  }, [processCommand, toast]);

  if (!isSupported) {
    return null;
  }

  return (
    <>
      {/* Voice Button */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="fixed bottom-6 left-6 z-50"
      >
        <Button
          onClick={startListening}
          disabled={isListening}
          size="icon"
          className={`h-12 w-12 rounded-full shadow-lg transition-all ${
            isListening 
              ? "bg-red-500 hover:bg-red-600 animate-pulse" 
              : "bg-accent hover:bg-accent/90"
          }`}
          aria-label={isListening ? "Listening..." : "Voice navigation"}
        >
          {isListening ? (
            <Volume2 className="h-5 w-5 text-accent-foreground animate-pulse" />
          ) : (
            <Mic className="h-5 w-5 text-accent-foreground" />
          )}
        </Button>
      </motion.div>

      {/* Feedback Overlay */}
      <AnimatePresence>
        {showFeedback && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed bottom-24 left-6 z-50 max-w-xs"
          >
            <div className="bg-foreground text-background px-4 py-3 rounded-xl shadow-xl">
              {transcript && (
                <p className="text-sm opacity-70 mb-1">"{transcript}"</p>
              )}
              <p className="font-medium text-sm">{feedbackText}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
