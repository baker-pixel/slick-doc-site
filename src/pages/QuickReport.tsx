import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Calendar, Download, Loader2, RefreshCw, Search } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ReportView } from "@/components/report/ReportView";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { downloadReportPdf } from "@/lib/downloadReportPdf";
import {
  type AnalysisResult,
  buildReportData,
  getTier,
  getTierColor,
  getTierLabel,
} from "@/lib/quickAnalysisReport";

interface LoadedReport {
  name: string | null;
  websiteUrl: string | null;
  createdAt: string;
  analysis: AnalysisResult;
  aiReadinessScore: number | null;
}

type LoadState = "loading" | "ready" | "not_found" | "error";

// The online version of the report emailed after a Quick Analysis scan
// (/quick-report/:token). The token is a random UUID; lookups go through the
// get-prospect-report edge function so no contact data is ever exposed.
export default function QuickReport() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [state, setState] = useState<LoadState>("loading");
  const [report, setReport] = useState<LoadedReport | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const load = async () => {
    if (!token) {
      setState("not_found");
      return;
    }
    setState("loading");
    try {
      const { data, error } = await supabase.functions.invoke("get-prospect-report", { body: { token } });
      // supabase-js surfaces a non-2xx as `error`; a 404 here just means "no such report".
      if (error) {
        const status = (error as { context?: Response }).context?.status;
        setState(status === 404 ? "not_found" : "error");
        return;
      }
      if (!data?.found || !data.report?.analysis) {
        setState("not_found");
        return;
      }
      setReport(data.report as LoadedReport);
      setState("ready");
    } catch (err) {
      console.error("Failed to load report:", err);
      setState("error");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const reportData = useMemo(() => {
    if (!report) return null;
    const domain = (report.websiteUrl ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    return buildReportData(report.analysis, {
      // Domain, not the visitor's name ("Yash has clear opportunities").
      businessName: domain,
      domain,
      reportDate: new Date(report.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      aiReadinessScore: report.aiReadinessScore ?? undefined,
    });
  }, [report]);

  const downloadPDF = async () => {
    if (!reportData || isDownloading) return;
    setIsDownloading(true);
    try {
      await downloadReportPdf(reportData);
    } catch (err) {
      console.error("Failed to download PDF:", err);
      toast({ title: "PDF download failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-20">
        <section className="section-padding bg-gradient-to-b from-cream to-background">
          <div className="container-wide mx-auto">
            {state === "loading" && (
              <div className="flex flex-col items-center justify-center py-32 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
                Loading your report…
              </div>
            )}

            {(state === "not_found" || state === "error") && (
              <Card className="max-w-xl mx-auto mt-12">
                <CardContent className="p-8 text-center">
                  <h1 className="text-2xl font-semibold mb-2">
                    {state === "not_found" ? "We couldn't find that report" : "We couldn't load your report"}
                  </h1>
                  <p className="text-muted-foreground mb-6">
                    {state === "not_found"
                      ? "The link may be incomplete or out of date. You can get a fresh report in about a minute, no sign-in needed."
                      : "Something went wrong on our end. Please try again, or run a fresh analysis."}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    {state === "error" && (
                      <Button variant="outline" onClick={load}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Try again
                      </Button>
                    )}
                    <Button asChild>
                      <Link to="/quick-analysis">
                        <Search className="mr-2 h-4 w-4" />
                        Get a free website analysis
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link to="/schedule">Talk to our team</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {state === "ready" && report && reportData && (
              <div className="space-y-8 max-w-4xl mx-auto">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium ${getTierColor(getTier(reportData.overallScore))}`}
                  >
                    Recommended: {getTierLabel(getTier(reportData.overallScore))} Tier
                  </div>
                  <Button onClick={downloadPDF} disabled={isDownloading} variant="outline" className="gap-2">
                    {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Download PDF
                  </Button>
                </div>

                <div className="rounded-2xl border border-border overflow-hidden text-left">
                  <ReportView data={reportData} hideFooterCta />
                </div>

                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="p-8 text-center">
                    <h3 className="text-xl font-semibold mb-2">Want us to fix all of this for you?</h3>
                    <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                      Orange Door handles your entire marketing — SEO, content, social media, email campaigns, and
                      monthly reports. You don&apos;t need to lift a finger.
                    </p>
                    <Button size="lg" onClick={() => navigate("/schedule")}>
                      <Calendar className="mr-2 h-4 w-4" />
                      Book a Free Strategy Call
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
