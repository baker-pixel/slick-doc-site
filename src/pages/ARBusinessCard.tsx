import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Download, Share2, Smartphone } from "lucide-react";

const ARBusinessCard = () => {
  const [isFlipped, setIsFlipped] = useState(false);
  const presentationUrl = `${window.location.origin}/ar-presentation`;

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: "Orange Door Marketing - AR Business Card",
        text: "Check out our interactive AR business card!",
        url: presentationUrl,
      });
    } else {
      navigator.clipboard.writeText(presentationUrl);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              AR Business Card
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Scan the QR code to experience an interactive presentation of our services
            </p>
          </motion.div>

          <div className="flex flex-col lg:flex-row items-center justify-center gap-12">
            {/* Business Card */}
            <motion.div
              className="relative w-[350px] h-[200px] cursor-pointer perspective-1000"
              onClick={() => setIsFlipped(!isFlipped)}
              whileHover={{ scale: 1.02 }}
            >
              <AnimatePresence mode="wait">
                {!isFlipped ? (
                  <motion.div
                    key="front"
                    initial={{ rotateY: 180 }}
                    animate={{ rotateY: 0 }}
                    exit={{ rotateY: -180 }}
                    transition={{ duration: 0.6 }}
                    className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 p-6 shadow-2xl backface-hidden"
                  >
                    <div className="h-full flex flex-col justify-between text-primary-foreground">
                      <div>
                        <h2 className="text-2xl font-bold">Orange Door</h2>
                        <p className="text-primary-foreground/80 text-sm">Marketing</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Full-Service Digital Marketing</p>
                        <p className="text-xs text-primary-foreground/70">Knoxville, Tennessee</p>
                        <p className="text-xs text-primary-foreground/70">orangedoormarketing.com</p>
                      </div>
                      <p className="text-xs text-primary-foreground/50 text-center">
                        Tap to flip
                      </p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="back"
                    initial={{ rotateY: -180 }}
                    animate={{ rotateY: 0 }}
                    exit={{ rotateY: 180 }}
                    transition={{ duration: 0.6 }}
                    className="absolute inset-0 rounded-2xl bg-card border border-border p-6 shadow-2xl backface-hidden flex items-center justify-center"
                  >
                    <div className="text-center">
                      <QRCodeSVG
                        value={presentationUrl}
                        size={120}
                        bgColor="transparent"
                        fgColor="hsl(var(--foreground))"
                        level="H"
                        includeMargin={false}
                      />
                      <p className="text-xs text-muted-foreground mt-2">
                        Scan for AR Experience
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* QR Code Display */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="bg-card border border-border rounded-3xl p-8 shadow-xl"
            >
              <div className="text-center mb-6">
                <Smartphone className="w-8 h-8 text-primary mx-auto mb-2" />
                <h3 className="text-xl font-semibold text-foreground">Scan to Experience</h3>
                <p className="text-sm text-muted-foreground">Point your camera at the QR code</p>
              </div>
              
              <div className="bg-white p-4 rounded-xl mb-6">
                <QRCodeSVG
                  value={presentationUrl}
                  size={200}
                  bgColor="#ffffff"
                  fgColor="#1a1a2e"
                  level="H"
                  includeMargin={true}
                />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleShare}
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => window.open(presentationUrl, '_blank')}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Open
                </Button>
              </div>
            </motion.div>
          </div>

          {/* Instructions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-16 max-w-2xl mx-auto"
          >
            <h3 className="text-2xl font-semibold text-foreground text-center mb-8">
              How It Works
            </h3>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { step: "1", title: "Scan", desc: "Point your phone camera at the QR code" },
                { step: "2", title: "Open", desc: "Tap the link that appears on your screen" },
                { step: "3", title: "Experience", desc: "Watch our animated service presentation" },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + i * 0.1 }}
                  className="text-center"
                >
                  <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold mx-auto mb-3">
                    {item.step}
                  </div>
                  <h4 className="font-semibold text-foreground mb-1">{item.title}</h4>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ARBusinessCard;
