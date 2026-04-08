import { Link } from "react-router-dom";
import { ArrowRight, Target, CheckCircle2, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface PlainEnglishSummaryData {
  headline?: string;
  what_this_means?: string;
  top_priority?: string;
  biggest_opportunity?: string;
  what_is_working?: string;
}

interface PlainEnglishSummaryProps {
  summary: PlainEnglishSummaryData | null | undefined;
  overallScore: number;
}

function getScoreTier(score: number) {
  if (score >= 81) return { label: "Optimisation tier — fine-tuning needed", color: "bg-emerald-500", zone: 3 };
  if (score >= 56) return { label: "Foundation tier — solid base to build on", color: "bg-blue-500", zone: 2 };
  if (score >= 31) return { label: "Growth tier — good gaps to close", color: "bg-amber-500", zone: 1 };
  return { label: "Transformation tier — significant work needed", color: "bg-red-500", zone: 0 };
}

export function PlainEnglishSummary({ summary, overallScore }: PlainEnglishSummaryProps) {
  if (!summary) return null;

  const tier = getScoreTier(overallScore);

  return (
    <div className="space-y-6">
      {/* Main Summary Card */}
      <Card className="border-primary/20 bg-gradient-to-br from-background to-muted/30">
        <CardContent className="pt-6 space-y-5">
          <h2 className="text-2xl font-display font-bold text-foreground">
            What This Means For Your Business
          </h2>

          {summary.headline && (
            <p className="text-lg font-semibold text-foreground leading-snug">
              {summary.headline}
            </p>
          )}

          {summary.what_this_means && (
            <p className="text-base text-muted-foreground leading-relaxed">
              {summary.what_this_means}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Three Callout Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Top Priority */}
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
          <CardContent className="pt-5 space-y-2">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <h3 className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
                Your Top Priority
              </h3>
            </div>
            <p className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed">
              {summary.top_priority || "Complete your gap analysis to get personalised advice."}
            </p>
          </CardContent>
        </Card>

        {/* What's Working */}
        <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800">
          <CardContent className="pt-5 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <h3 className="font-semibold text-emerald-800 dark:text-emerald-300 text-sm">
                What's Working
              </h3>
            </div>
            <p className="text-sm text-emerald-900 dark:text-emerald-200 leading-relaxed">
              {summary.what_is_working || "Your brand has potential to grow."}
            </p>
          </CardContent>
        </Card>

        {/* Biggest Opportunity */}
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800">
          <CardContent className="pt-5 space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
              <h3 className="font-semibold text-blue-800 dark:text-blue-300 text-sm">
                Your Biggest Opportunity
              </h3>
            </div>
            <p className="text-sm text-blue-900 dark:text-blue-200 leading-relaxed">
              {summary.biggest_opportunity || "See the detailed findings below."}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Score Bar */}
      <Card className="border-border/50">
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Your Score: {overallScore}/100</span>
            <span className="text-sm text-muted-foreground">{tier.label}</span>
          </div>
          <div className="relative">
            {/* Zone bar */}
            <div className="flex h-4 rounded-full overflow-hidden">
              <div className="flex-1 bg-red-200 dark:bg-red-900/40" />
              <div className="flex-1 bg-amber-200 dark:bg-amber-900/40" />
              <div className="flex-1 bg-blue-200 dark:bg-blue-900/40" />
              <div className="flex-1 bg-emerald-200 dark:bg-emerald-900/40" />
            </div>
            {/* Marker */}
            <div
              className="absolute top-0 -translate-x-1/2"
              style={{ left: `${Math.min(Math.max(overallScore, 2), 98)}%` }}
            >
              <div className="w-1 h-4 bg-foreground rounded-full" />
              <div className="text-xs font-bold text-foreground text-center mt-1 -ml-2 w-5">
                {overallScore}
              </div>
            </div>
            {/* Zone labels */}
            <div className="flex mt-5 text-[10px] text-muted-foreground">
              <div className="flex-1 text-center">0–30</div>
              <div className="flex-1 text-center">31–55</div>
              <div className="flex-1 text-center">56–80</div>
              <div className="flex-1 text-center">81–100</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CTA Button */}
      <div className="flex justify-center">
        <Link to="/schedule" className="w-full md:w-auto">
          <Button
            size="lg"
            className="w-full md:w-auto bg-primary hover:bg-primary/90 text-primary-foreground gap-2 text-base px-8 py-6"
          >
            Get Orange Door to handle all of this for you → Book a free call
            <ArrowRight size={18} />
          </Button>
        </Link>
      </div>
    </div>
  );
}
