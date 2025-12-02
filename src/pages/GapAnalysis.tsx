import { useSearchParams, Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { GapAnalysisForm } from "@/components/gap-analysis/GapAnalysisForm";
import { motion } from "framer-motion";
import { Clock, FileText, Target, Zap, Globe, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const GapAnalysis = () => {
  const [searchParams] = useSearchParams();
  const resumeToken = searchParams.get("resume");

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
              className="max-w-3xl mx-auto text-center"
            >
              <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
                {resumeToken ? "Welcome Back!" : "Free SYSTEM Gap Analysis"}
              </span>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-semibold text-foreground mb-4">
                {resumeToken ? "Continue Your Gap Analysis" : "Discover Your Digital Marketing Gaps"}
              </h1>
              <p className="text-muted-foreground text-lg mb-8">
                {resumeToken 
                  ? "Your progress has been saved. Pick up right where you left off."
                  : "Complete this intake form and we'll prepare a comprehensive SYSTEM Gap Report showing exactly where your marketing is leaking opportunity."
                }
              </p>

              {!resumeToken && (
                <>
                  <div className="flex flex-wrap justify-center gap-6 mb-8">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock size={18} className="text-primary" />
                      <span>10-15 minutes</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText size={18} className="text-primary" />
                      <span>Personalized report</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Target size={18} className="text-primary" />
                      <span>Actionable insights</span>
                    </div>
                  </div>

                  {/* Quick Analysis Option */}
                  <Link to="/quick-analysis">
                    <Card className="max-w-xl mx-auto border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer mb-8">
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Zap className="text-primary" size={20} />
                        </div>
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground text-sm">Short on time?</span>
                            <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">Instant</span>
                          </div>
                          <p className="text-muted-foreground text-xs">
                            Just enter your website URL for an instant AI-powered health check
                          </p>
                        </div>
                        <ArrowRight className="text-primary flex-shrink-0" size={18} />
                      </CardContent>
                    </Card>
                  </Link>
                </>
              )}
            </motion.div>
          </div>
        </section>

        {/* Form Section */}
        <section className="section-padding pb-24">
          <div className="container-wide mx-auto">
            <div className="bg-card rounded-2xl border border-border p-6 sm:p-10 shadow-lg">
              <GapAnalysisForm resumeToken={resumeToken} />
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default GapAnalysis;
