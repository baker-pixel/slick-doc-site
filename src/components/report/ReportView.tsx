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
export function ReportView({ data, printMode = false }: { data: ReportData; printMode?: boolean }) {
  const weakestPillar = data.categoryScores.length > 0
    ? data.categoryScores.reduce((min, c) => (c.score < min.score ? c : min), data.categoryScores[0])
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

      <FooterCTA />
    </PrintModeProvider>
  );
}
