import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, TrendingUp, Mail, CreditCard, Heart, BarChart3, 
  Calendar, FileText, ArrowRight, CheckCircle2, AlertCircle,
  Loader2
} from "lucide-react";
import { 
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, 
  Radar, ResponsiveContainer, Tooltip
} from "recharts";

interface SubmissionData {
  id: string;
  first_name: string;
  last_name: string;
  business_name: string;
  email: string;
  created_at: string;
  completed_at: string | null;
  status: string;
  ai_analysis: any;
  // Add more fields as needed
  investing_in_seo: boolean | null;
  ranking_for_keywords: boolean | null;
  tracks_website_conversions: boolean | null;
  running_paid_ads: boolean | null;
  uses_email_automation: boolean | null;
  has_crm: boolean | null;
  asks_for_reviews: boolean | null;
  uses_google_analytics: boolean | null;
}

const systemAreas = [
  { key: "search", letter: "S", title: "Search & Visibility", icon: Search, color: "text-orange-500" },
  { key: "yield", letter: "Y", title: "Yield Optimization", icon: TrendingUp, color: "text-emerald-500" },
  { key: "sequence", letter: "S", title: "Sequence & Nurture", icon: Mail, color: "text-blue-500" },
  { key: "transaction", letter: "T", title: "Transaction Activation", icon: CreditCard, color: "text-violet-500" },
  { key: "engagement", letter: "E", title: "Engagement & Retention", icon: Heart, color: "text-rose-500" },
  { key: "metrics", letter: "M", title: "Metrics & Improvement", icon: BarChart3, color: "text-amber-500" },
];

const calculateScores = (data: SubmissionData) => {
  // Calculate scores based on submission data
  const scores: Record<string, number> = {
    search: 0,
    yield: 0,
    sequence: 0,
    transaction: 0,
    engagement: 0,
    metrics: 0,
  };

  // Search & Visibility
  if (data.investing_in_seo) scores.search += 25;
  if (data.ranking_for_keywords) scores.search += 25;
  if (data.running_paid_ads) scores.search += 25;
  if (data.tracks_website_conversions) scores.search += 25;

  // Yield Optimization
  if (data.tracks_website_conversions) scores.yield += 50;
  if (data.running_paid_ads) scores.yield += 50;

  // Sequence & Nurture
  if (data.uses_email_automation) scores.sequence += 50;
  if (data.has_crm) scores.sequence += 50;

  // Transaction Activation
  if (data.has_crm) scores.transaction += 50;
  if (data.tracks_website_conversions) scores.transaction += 50;

  // Engagement & Retention
  if (data.asks_for_reviews) scores.engagement += 50;
  if (data.uses_email_automation) scores.engagement += 50;

  // Metrics & Improvement
  if (data.uses_google_analytics) scores.metrics += 50;
  if (data.tracks_website_conversions) scores.metrics += 50;

  return scores;
};

const Dashboard = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SubmissionData | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchData = async () => {
      if (!token) {
        setError("Invalid access link");
        setLoading(false);
        return;
      }

      try {
        const { data: submission, error: fetchError } = await supabase
          .from("gap_analysis_submissions")
          .select("*")
          .eq("resume_token", token)
          .single();

        if (fetchError || !submission) {
          setError("Dashboard not found. Please check your access link.");
          setLoading(false);
          return;
        }

        setData(submission as SubmissionData);
        setScores(calculateScores(submission as SubmissionData));
      } catch (err) {
        setError("Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  const overallScore = Object.values(scores).reduce((a, b) => a + b, 0) / 6;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-32 pb-16">
          <div className="container mx-auto px-4 text-center">
            <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-foreground mb-2">{error}</h1>
            <p className="text-muted-foreground mb-6">
              If you completed a gap analysis, check your email for the correct link.
            </p>
            <Button asChild>
              <Link to="/gap-analysis">Start New Gap Analysis</Link>
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4">
          {/* Welcome Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
              Welcome back, {data.first_name}!
            </h1>
            <p className="text-muted-foreground">
              {data.business_name} - Gap Analysis Dashboard
            </p>
          </motion.div>

          {/* Overall Score Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-8"
          >
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div>
                    <h2 className="text-lg font-medium text-muted-foreground mb-1">
                      Overall SYSTEM Score
                    </h2>
                    <div className="flex items-baseline gap-2">
                      <span className="text-5xl font-bold text-primary">
                        {Math.round(overallScore)}
                      </span>
                      <span className="text-2xl text-muted-foreground">/100</span>
                    </div>
                  </div>
                  <div className="flex-1 max-w-md w-full">
                    <Progress value={overallScore} className="h-4" />
                    <p className="text-sm text-muted-foreground mt-2 text-center">
                      {overallScore < 40 ? "Foundation building needed" : 
                       overallScore < 70 ? "Good progress - room to grow" : 
                       "Strong foundation - optimize for excellence"}
                    </p>
                  </div>
                  <Button asChild>
                    <Link to="/schedule">
                      <Calendar className="w-4 h-4 mr-2" />
                      Schedule Strategy Call
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* SYSTEM Scores with Radar Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-8"
          >
            <h2 className="text-xl font-semibold text-foreground mb-4">
              SYSTEM Breakdown
            </h2>
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Radar Chart */}
              <Card className="border-primary/10">
                <CardContent className="p-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart 
                      data={systemAreas.map(area => ({
                        area: area.letter,
                        fullName: area.title,
                        score: scores[area.key] || 0,
                        fullMark: 100
                      }))}
                      margin={{ top: 20, right: 30, bottom: 20, left: 30 }}
                    >
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis 
                        dataKey="area" 
                        tick={{ fill: 'hsl(var(--foreground))', fontSize: 14, fontWeight: 600 }}
                      />
                      <PolarRadiusAxis 
                        angle={90} 
                        domain={[0, 100]} 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                        tickCount={5}
                      />
                      <Radar
                        name="Score"
                        dataKey="score"
                        stroke="hsl(var(--primary))"
                        fill="hsl(var(--primary))"
                        fillOpacity={0.3}
                        strokeWidth={2}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                        }}
                        formatter={(value: number, name: string, props: any) => [
                          `${value}%`, 
                          props.payload.fullName
                        ]}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Score Cards Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {systemAreas.map((area, index) => (
                  <motion.div
                    key={area.key}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 + index * 0.05 }}
                  >
                    <Card className="text-center hover:shadow-md transition-shadow h-full">
                      <CardContent className="p-4">
                        <div className={`w-10 h-10 rounded-lg bg-muted flex items-center justify-center mx-auto mb-2 ${area.color}`}>
                          <span className="text-lg font-bold">{area.letter}</span>
                        </div>
                        <h3 className="text-xs font-medium text-muted-foreground mb-1 line-clamp-1">
                          {area.title}
                        </h3>
                        <div className="text-2xl font-bold text-foreground">
                          {scores[area.key] || 0}%
                        </div>
                        <Progress 
                          value={scores[area.key] || 0} 
                          className="h-1.5 mt-2" 
                        />
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Tabs for Details */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Tabs defaultValue="recommendations" className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-6">
                <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
                <TabsTrigger value="analysis">AI Analysis</TabsTrigger>
                <TabsTrigger value="actions">Next Steps</TabsTrigger>
              </TabsList>

              <TabsContent value="recommendations">
                <Card>
                  <CardHeader>
                    <CardTitle>Personalized Recommendations</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {Object.entries(scores)
                      .filter(([_, score]) => score < 50)
                      .map(([key, _]) => {
                        const area = systemAreas.find(a => a.key === key);
                        if (!area) return null;
                        return (
                          <div key={key} className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                            <area.icon className={`w-5 h-5 mt-0.5 ${area.color}`} />
                            <div>
                              <h4 className="font-medium text-foreground">{area.title}</h4>
                              <p className="text-sm text-muted-foreground">
                                Focus area - consider improving your {area.title.toLowerCase()} strategy for better results.
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    {Object.values(scores).every(s => s >= 50) && (
                      <div className="flex items-center gap-3 p-4 bg-green-500/10 rounded-lg">
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                        <p className="text-foreground">
                          Great job! You're performing well across all SYSTEM areas.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="analysis">
                <Card>
                  <CardHeader>
                    <CardTitle>AI-Powered Analysis</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {data.ai_analysis ? (
                      <>
                        {/* Executive Summary */}
                        {data.ai_analysis.executiveSummary && (
                          <div>
                            <h4 className="font-semibold text-foreground mb-2">Executive Summary</h4>
                            <p className="text-muted-foreground text-sm leading-relaxed">
                              {data.ai_analysis.executiveSummary}
                            </p>
                          </div>
                        )}

                        {/* Key Strengths */}
                        {data.ai_analysis.strengths?.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              Key Strengths
                            </h4>
                            <ul className="space-y-1.5">
                              {data.ai_analysis.strengths.map((strength: string, idx: number) => (
                                <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                                  <span className="text-emerald-500 mt-1">•</span>
                                  {strength}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Critical Gaps */}
                        {data.ai_analysis.gaps?.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                              <AlertCircle className="w-4 h-4 text-orange-500" />
                              Areas for Improvement
                            </h4>
                            <ul className="space-y-1.5">
                              {data.ai_analysis.gaps.map((gap: string, idx: number) => (
                                <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                                  <span className="text-orange-500 mt-1">•</span>
                                  {gap}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Top Recommendations */}
                        {data.ai_analysis.recommendations?.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-foreground mb-3">Top Recommendations</h4>
                            <div className="space-y-3">
                              {data.ai_analysis.recommendations.map((rec: { title: string; description: string; priority: string }, idx: number) => (
                                <div key={idx} className="bg-muted/50 rounded-lg p-3">
                                  <div className="flex items-start justify-between gap-2 mb-1">
                                    <h5 className="font-medium text-foreground text-sm">{rec.title}</h5>
                                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                                      {rec.priority}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground">{rec.description}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-muted-foreground">
                        AI analysis is being generated. Check back soon!
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="actions">
                <Card>
                  <CardHeader>
                    <CardTitle>Recommended Next Steps</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Link 
                      to="/schedule" 
                      className="flex items-center justify-between p-4 bg-primary/5 rounded-lg hover:bg-primary/10 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Calendar className="w-5 h-5 text-primary" />
                        <div>
                          <h4 className="font-medium text-foreground">Schedule a Strategy Call</h4>
                          <p className="text-sm text-muted-foreground">
                            Discuss your results with our team
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-primary" />
                    </Link>

                    <Link 
                      to={`/report/${data.id}`}
                      className="flex items-center justify-between p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-foreground" />
                        <div>
                          <h4 className="font-medium text-foreground">View Full Report</h4>
                          <p className="text-sm text-muted-foreground">
                            Download detailed PDF report
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-muted-foreground" />
                    </Link>

                    <Link 
                      to="/system"
                      className="flex items-center justify-between p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <BarChart3 className="w-5 h-5 text-foreground" />
                        <div>
                          <h4 className="font-medium text-foreground">Learn About The SYSTEM</h4>
                          <p className="text-sm text-muted-foreground">
                            Understand our 6-step framework
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-muted-foreground" />
                    </Link>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </motion.div>

          {/* Submission Info */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-8 text-center text-sm text-muted-foreground"
          >
            <p>
              Analysis submitted on {new Date(data.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Dashboard;
