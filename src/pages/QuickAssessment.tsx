import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Clock, Zap, CheckCircle, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface QuickAnswers {
  seoInvesting: string;
  websiteLeads: string;
  followUpSystem: string;
  reviewStrategy: string;
  analyticsTracking: string;
  email: string;
  firstName: string;
  businessName: string;
}

const initialAnswers: QuickAnswers = {
  seoInvesting: "",
  websiteLeads: "",
  followUpSystem: "",
  reviewStrategy: "",
  analyticsTracking: "",
  email: "",
  firstName: "",
  businessName: "",
};

const questions = [
  {
    id: "seoInvesting",
    category: "S",
    label: "Search & Visibility",
    question: "Are you actively investing in SEO or local search optimization?",
    options: [
      { value: "yes", label: "Yes, consistently", score: 3 },
      { value: "some", label: "Occasionally", score: 2 },
      { value: "no", label: "Not really", score: 1 },
    ],
  },
  {
    id: "websiteLeads",
    category: "Y",
    label: "Yield Optimization",
    question: "How many leads does your website generate per month?",
    options: [
      { value: "high", label: "10+ leads", score: 3 },
      { value: "medium", label: "3-10 leads", score: 2 },
      { value: "low", label: "Less than 3", score: 1 },
    ],
  },
  {
    id: "followUpSystem",
    category: "S",
    label: "Sequence & Nurture",
    question: "Do you have automated follow-up for leads who don't convert immediately?",
    options: [
      { value: "yes", label: "Yes, automated emails/SMS", score: 3 },
      { value: "manual", label: "Manual follow-up only", score: 2 },
      { value: "no", label: "No follow-up system", score: 1 },
    ],
  },
  {
    id: "reviewStrategy",
    category: "E",
    label: "Engagement & Retention",
    question: "Do you systematically ask customers for reviews?",
    options: [
      { value: "automated", label: "Yes, automated requests", score: 3 },
      { value: "sometimes", label: "Sometimes, manually", score: 2 },
      { value: "rarely", label: "Rarely or never", score: 1 },
    ],
  },
  {
    id: "analyticsTracking",
    category: "M",
    label: "Metrics & Improvement",
    question: "Do you know which marketing channels bring your best leads?",
    options: [
      { value: "yes", label: "Yes, I track this", score: 3 },
      { value: "somewhat", label: "I have a rough idea", score: 2 },
      { value: "no", label: "No idea", score: 1 },
    ],
  },
];

export default function QuickAssessment() {
  const [answers, setAnswers] = useState<QuickAnswers>(initialAnswers);
  const [currentStep, setCurrentStep] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const totalSteps = questions.length + 1; // questions + contact info

  const updateAnswer = (key: keyof QuickAnswers, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const calculateScore = () => {
    let total = 0;
    questions.forEach((q) => {
      const answer = answers[q.id as keyof QuickAnswers];
      const option = q.options.find((o) => o.value === answer);
      if (option) total += option.score;
    });
    return Math.round((total / (questions.length * 3)) * 100);
  };

  const getScoreStatus = (score: number) => {
    if (score >= 70) return { label: "Strong", color: "bg-emerald-500", textColor: "text-emerald-600" };
    if (score >= 50) return { label: "Moderate", color: "bg-yellow-500", textColor: "text-yellow-600" };
    if (score >= 30) return { label: "Needs Work", color: "bg-orange-500", textColor: "text-orange-600" };
    return { label: "Critical", color: "bg-red-500", textColor: "text-red-600" };
  };

  const handleNext = async () => {
    if (currentStep < questions.length) {
      setCurrentStep((prev) => prev + 1);
    } else {
      // Submit and show results
      setIsSubmitting(true);
      try {
        await supabase.from("gap_analysis_submissions").insert({
          first_name: answers.firstName,
          last_name: "",
          business_name: answers.businessName,
          email: answers.email,
          investing_in_seo: answers.seoInvesting === "yes",
          monthly_website_leads: answers.websiteLeads === "high" ? 15 : answers.websiteLeads === "medium" ? 5 : 1,
          uses_email_automation: answers.followUpSystem === "yes",
          asks_for_reviews: answers.reviewStrategy !== "rarely",
          knows_best_lead_sources: answers.analyticsTracking === "yes",
          status: "quick_assessment",
          is_partial: true,
        });
        setShowResults(true);
      } catch (err) {
        console.error(err);
        toast({
          title: "Error",
          description: "Something went wrong. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const canProceed = () => {
    if (currentStep < questions.length) {
      return !!answers[questions[currentStep].id as keyof QuickAnswers];
    }
    return answers.firstName && answers.email && answers.businessName;
  };

  const score = calculateScore();
  const status = getScoreStatus(score);

  if (showResults) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-16 max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-8"
          >
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Zap className="text-primary" size={40} />
            </div>

            <div>
              <h1 className="text-3xl font-display font-bold text-foreground mb-2">
                Your Quick SYSTEM Score
              </h1>
              <p className="text-muted-foreground">
                Here's a snapshot of your digital marketing health, {answers.firstName}
              </p>
            </div>

            <Card className="border-primary/20">
              <CardContent className="pt-8 pb-8">
                <div className="text-6xl font-bold text-primary mb-2">{score}</div>
                <Badge className={`${status.color} text-white`}>{status.label}</Badge>
                <div className="h-3 bg-secondary rounded-full mt-6 overflow-hidden max-w-xs mx-auto">
                  <motion.div
                    className={status.color}
                    initial={{ width: 0 }}
                    animate={{ width: `${score}%` }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    style={{ height: "100%" }}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="bg-secondary/50 rounded-xl p-6 text-left">
              <h3 className="font-semibold text-foreground mb-4">What This Means</h3>
              {score < 50 ? (
                <p className="text-muted-foreground text-sm">
                  Your digital marketing has significant gaps that are likely costing you leads and revenue. 
                  A full assessment will identify exactly where you're losing opportunities and how to fix them.
                </p>
              ) : score < 70 ? (
                <p className="text-muted-foreground text-sm">
                  You have some marketing fundamentals in place, but there's room for optimization. 
                  A full assessment will reveal the specific areas where small improvements can drive big results.
                </p>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Your marketing foundation looks solid! A full assessment will help identify advanced 
                  opportunities to scale and fine-tune your systems for even better results.
                </p>
              )}
            </div>

            <div className="space-y-4">
              <Link to="/gap-analysis">
                <Button size="lg" className="w-full bg-primary hover:bg-orange-dark text-primary-foreground gap-2">
                  Get Your Full SYSTEM Analysis
                  <ArrowRight size={18} />
                </Button>
              </Link>
              <p className="text-xs text-muted-foreground">
                Takes about 10 minutes • Personalized AI-powered recommendations
              </p>
              <Link to="/contact">
                <Button variant="outline" className="w-full gap-2">
                  Or Schedule a Strategy Call Instead
                  <ChevronRight size={16} />
                </Button>
              </Link>
            </div>
          </motion.div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-16 max-w-2xl">
        <div className="mb-4">
          <BackButton />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium mb-4">
              <Clock size={14} />
              2-minute assessment
            </div>
            <h1 className="text-3xl font-display font-bold text-foreground mb-2">
              Quick SYSTEM Check
            </h1>
            <p className="text-muted-foreground">
              Answer 5 questions to get an instant snapshot of your marketing health
            </p>
          </div>

          {/* Progress */}
          <div className="mb-8">
            <div className="flex justify-between text-sm text-muted-foreground mb-2">
              <span>Question {Math.min(currentStep + 1, questions.length)} of {questions.length}</span>
              <span>{Math.round(((currentStep) / totalSteps) * 100)}%</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary"
                animate={{ width: `${((currentStep) / totalSteps) * 100}%` }}
              />
            </div>
          </div>

          {/* Question or Contact Form */}
          <Card>
            <CardContent className="pt-6">
              {currentStep < questions.length ? (
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6"
                >
                  <div>
                    <Badge variant="outline" className="mb-3">
                      {questions[currentStep].category} - {questions[currentStep].label}
                    </Badge>
                    <h2 className="text-xl font-semibold text-foreground">
                      {questions[currentStep].question}
                    </h2>
                  </div>

                  <RadioGroup
                    value={answers[questions[currentStep].id as keyof QuickAnswers]}
                    onValueChange={(value) => updateAnswer(questions[currentStep].id as keyof QuickAnswers, value)}
                    className="space-y-3"
                  >
                    {questions[currentStep].options.map((option) => (
                      <Label
                        key={option.value}
                        htmlFor={option.value}
                        className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                          answers[questions[currentStep].id as keyof QuickAnswers] === option.value
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <RadioGroupItem value={option.value} id={option.value} />
                        <span>{option.label}</span>
                      </Label>
                    ))}
                  </RadioGroup>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6"
                >
                  <div>
                    <h2 className="text-xl font-semibold text-foreground mb-1">
                      Almost there!
                    </h2>
                    <p className="text-muted-foreground text-sm">
                      Enter your details to see your instant score
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        value={answers.firstName}
                        onChange={(e) => updateAnswer("firstName", e.target.value)}
                        placeholder="Your first name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="businessName">Business Name</Label>
                      <Input
                        id="businessName"
                        value={answers.businessName}
                        onChange={(e) => updateAnswer("businessName", e.target.value)}
                        placeholder="Your company name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={answers.email}
                        onChange={(e) => updateAnswer("email", e.target.value)}
                        placeholder="you@company.com"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="mt-6">
            <Button
              onClick={handleNext}
              disabled={!canProceed() || isSubmitting}
              className="w-full bg-primary hover:bg-orange-dark text-primary-foreground gap-2"
            >
              {isSubmitting ? (
                "Calculating..."
              ) : currentStep < questions.length ? (
                <>
                  Next
                  <ArrowRight size={16} />
                </>
              ) : (
                <>
                  See My Score
                  <CheckCircle size={16} />
                </>
              )}
            </Button>
          </div>

          {/* Link to full assessment */}
          <p className="text-center text-sm text-muted-foreground mt-6">
            Have more time?{" "}
            <Link to="/gap-analysis" className="text-primary hover:underline">
              Take the full assessment
            </Link>{" "}
            for detailed AI recommendations.
          </p>
        </motion.div>
      </main>
      <Footer />
    </div>
  );
}
