// SYSTEM Scorecard Calculator based on Orange Door's 6-step framework
// S - Search & Visibility
// Y - Yield Optimization  
// S - Sequence & Nurture
// T - Transaction Activation
// E - Engagement & Retention
// M - Metrics & Improvement

export interface SystemScore {
  category: string;
  label: string;
  score: number;
  status: 'critical' | 'weak' | 'moderate' | 'strong';
  color: string;
}

export interface SystemScorecard {
  scores: SystemScore[];
  overallScore: number;
  overallStatus: string;
}

export function calculateSystemScorecard(data: any): SystemScorecard {
  const scores: SystemScore[] = [];

  // S - Search & Visibility (SEO, local presence, discoverability)
  let searchScore = 20; // Base score
  if (data.investing_in_seo) searchScore += 20;
  if (data.ranking_for_keywords) searchScore += 20;
  if (data.knows_organic_traffic) searchScore += 10;
  if (data.tracking_keyword_rankings) searchScore += 15;
  if (data.monthly_organic_traffic && data.monthly_organic_traffic > 100) searchScore += 15;
  scores.push(createScore('S', 'Search & Visibility', Math.min(searchScore, 100)));

  // Y - Yield Optimization (website conversion, messaging, CTAs)
  let yieldScore = 20;
  if (data.tracks_website_conversions) yieldScore += 25;
  if (data.monthly_website_leads && data.monthly_website_leads > 5) yieldScore += 20;
  if (data.website_last_updated === 'Less than 6 months') yieldScore += 20;
  else if (data.website_last_updated === '6-12 months') yieldScore += 10;
  if (data.priority_improvement) yieldScore += 15;
  scores.push(createScore('Y', 'Yield Optimization', Math.min(yieldScore, 100)));

  // S - Sequence & Nurture (email automation, SMS, CRM, follow-ups)
  let sequenceScore = 10;
  if (data.uses_email_automation) sequenceScore += 20;
  if (data.uses_sms_followups) sequenceScore += 15;
  if (data.has_crm) sequenceScore += 15;
  if (data.crm_tracks_all_inbound) sequenceScore += 15;
  if (data.has_segmentation_drip) sequenceScore += 15;
  if (data.has_abandoned_followups) sequenceScore += 10;
  scores.push(createScore('S2', 'Sequence & Nurture', Math.min(sequenceScore, 100)));

  // T - Transaction Activation (sales process, response time, closing)
  let transactionScore = 20;
  if (data.uses_online_scheduling) transactionScore += 20;
  if (data.lead_response_time === 'Under 1 hour') transactionScore += 25;
  else if (data.lead_response_time === '1-4 hours') transactionScore += 15;
  else if (data.lead_response_time === 'Same day') transactionScore += 10;
  if (data.close_rate) {
    const rate = parseFloat(data.close_rate);
    if (rate >= 30) transactionScore += 20;
    else if (rate >= 20) transactionScore += 10;
  }
  if (data.common_objections) transactionScore += 10;
  scores.push(createScore('T', 'Transaction Activation', Math.min(transactionScore, 100)));

  // E - Engagement & Retention (reviews, loyalty, referrals, repeat business)
  let engagementScore = 15;
  if (data.asks_for_reviews) engagementScore += 15;
  if (data.monthly_new_reviews && data.monthly_new_reviews >= 5) engagementScore += 15;
  if (data.has_reputation_tool) engagementScore += 10;
  if (data.emails_past_customers) engagementScore += 15;
  if (data.has_loyalty_referral_program) engagementScore += 15;
  if (data.has_post_purchase_followup) engagementScore += 15;
  scores.push(createScore('E', 'Engagement & Retention', Math.min(engagementScore, 100)));

  // M - Metrics & Improvement (analytics, tracking, KPIs, reporting)
  let metricsScore = 10;
  if (data.uses_google_analytics) metricsScore += 20;
  if (data.knows_best_lead_sources) metricsScore += 20;
  if (data.kpis_tracked) metricsScore += 15;
  if (data.data_accuracy_confidence === 'High' || data.data_accuracy_confidence === 'Very High') metricsScore += 15;
  else if (data.data_accuracy_confidence === 'Medium') metricsScore += 8;
  if (data.does_ab_testing) metricsScore += 15;
  if (data.analytics_review_frequency === 'Weekly' || data.analytics_review_frequency === 'Daily') metricsScore += 10;
  scores.push(createScore('M', 'Metrics & Improvement', Math.min(metricsScore, 100)));

  // Calculate overall
  const overallScore = Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length);
  let overallStatus = '';
  if (overallScore >= 65) overallStatus = 'Good foundation - needs optimization';
  else if (overallScore >= 40) overallStatus = 'Moderate gaps - needs growth activation';
  else overallStatus = 'Critical gaps - needs full system rebuild';

  return { scores, overallScore, overallStatus };
}

function createScore(category: string, label: string, score: number): SystemScore {
  let status: 'critical' | 'weak' | 'moderate' | 'strong';
  let color: string;

  if (score >= 70) {
    status = 'strong';
    color = 'bg-green-500';
  } else if (score >= 50) {
    status = 'moderate';
    color = 'bg-yellow-500';
  } else if (score >= 30) {
    status = 'weak';
    color = 'bg-orange-500';
  } else {
    status = 'critical';
    color = 'bg-red-500';
  }

  return { category, label, score, status, color };
}

export function getStatusBadgeColor(status: string): string {
  switch (status) {
    case 'strong': return 'bg-green-100 text-green-800';
    case 'moderate': return 'bg-yellow-100 text-yellow-800';
    case 'weak': return 'bg-orange-100 text-orange-800';
    case 'critical': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}
