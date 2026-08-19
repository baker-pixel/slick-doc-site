import { CoverSection } from "./CoverSection";
import { ScoreTrajectorySection } from "./ScoreTrajectorySection";
import { ExecutiveSummarySection } from "./ExecutiveSummarySection";
import { CategoryScoresSection } from "./CategoryScoresSection";
import { StrengthsGapsSection } from "./StrengthsGapsSection";
import { ActionPlanSection } from "./ActionPlanSection";
import { FooterCTA } from "./FooterCTA";
import { PrintModeProvider } from "./PrintModeContext";
import type { ReportData } from "./ReportConfig";

// Single component tree the web report (Report.tsx, ReportStep.tsx,
// QuickAnalysis's result view) AND the server-rendered PDF (api/render-report-pdf.ts)
// all render. One tree fed by one ReportData shape is what makes "what we
// show" and "what we deliver" the same thing by construction, not two
// implementations staying in sync by hand.
interface ReportViewProps {
  data: ReportData;
  printMode?: boolean;
  /** Suppress the embedded "Schedule a call" footer -- for pages (QuickAnalysis,
   *  the gap-analysis result step) that already show their own CTA right below
   *  the report, so the reader doesn't see the same "book a call" ask twice in
   *  a row. Stays on for the PDF and the standalone shareable /report/:id page,
   *  where it's the only CTA present. */
  hideFooterCta?: boolean;
}

export function ReportView({ data, printMode = false, hideFooterCta = false }: ReportViewProps) {
  // Locked categories carry a placeholder score of 0 -- they'd always win
  // "weakest" otherwise, even though nothing was actually assessed there.
  const assessedScores = data.categoryScores.filter((c) => !c.locked);
  const weakestPillar = assessedScores.length > 0
    ? assessedScores.reduce((min, c) => (c.score < min.score ? c : min), assessedScores[0])
    : undefined;

  return (
    <PrintModeProvider value={printMode}>
      <CoverSection
        businessName={data.businessName}
        clientDomain={data.clientDomain}
        reportDate={data.reportDate}
        overallScore={data.overallScore}
      />

      <ScoreTrajectorySection
        currentScore={data.overallScore}
        aiReadinessScore={data.aiReadinessScore}
        weakestPillar={weakestPillar}
        milestones={data.actions.map((a) => a.title)}
      />

      {data.executiveSummary && (
        <ExecutiveSummarySection
          summary={data.executiveSummary}
          biggestOpportunity={data.biggestOpportunity}
          topGap={data.gaps[0]}
          topRecommendation={data.actions[0]?.title}
        />
      )}

      {data.categoryScores.length > 0 && <CategoryScoresSection scores={data.categoryScores} />}

      {(data.strengths.length > 0 || data.gaps.length > 0) && (
        <StrengthsGapsSection strengths={data.strengths} gaps={data.gaps} />
      )}

      {data.actions.length > 0 && <ActionPlanSection actions={data.actions} />}

      {!hideFooterCta && <FooterCTA />}
    </PrintModeProvider>
  );
}
