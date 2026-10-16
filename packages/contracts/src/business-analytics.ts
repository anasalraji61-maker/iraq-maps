/**
 * Business analytics contracts — provider-facing analytics endpoints.
 * All crowd-sourced stats carry Estimate<T> provenance.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { estimate, Problem } from './common';
import { ProviderId } from './providers';

const c = initContract();

// ─── Period ───────────────────────────────────────────────────────────────────

export const AnalyticsPeriod = z.enum(['7d', '30d', '90d', '1y']);
export type AnalyticsPeriod = z.infer<typeof AnalyticsPeriod>;

// ─── Time-series ─────────────────────────────────────────────────────────────

export const DailyBucket = z.object({
  date: z.string().date(),
  count: z.number().int().min(0),
});
export type DailyBucket = z.infer<typeof DailyBucket>;

export const HourlyScore = z.object({
  hour: z.number().int().min(0).max(23),
  /** 0–100 relative activity score */
  score: z.number().min(0).max(100),
  count: z.number().int().min(0),
});
export type HourlyScore = z.infer<typeof HourlyScore>;

// ─── Profile Views ────────────────────────────────────────────────────────────

export const ProfileViewsResponse = z.object({
  providerId: ProviderId,
  period: AnalyticsPeriod,
  total: z.number().int().min(0),
  changeVsPrevious: z.number(),
  daily: z.array(DailyBucket),
});
export type ProfileViewsResponse = z.infer<typeof ProfileViewsResponse>;

// ─── Search Impressions ───────────────────────────────────────────────────────

export const SearchImpressionsResponse = z.object({
  providerId: ProviderId,
  period: AnalyticsPeriod,
  total: z.number().int().min(0),
  changeVsPrevious: z.number(),
  daily: z.array(DailyBucket),
});
export type SearchImpressionsResponse = z.infer<typeof SearchImpressionsResponse>;

// ─── Direction Requests ───────────────────────────────────────────────────────

export const DirectionRequestsResponse = z.object({
  providerId: ProviderId,
  period: AnalyticsPeriod,
  total: z.number().int().min(0),
  changeVsPrevious: z.number(),
  daily: z.array(DailyBucket),
});
export type DirectionRequestsResponse = z.infer<typeof DirectionRequestsResponse>;

// ─── Message Stats ────────────────────────────────────────────────────────────

export const MessageStatsResponse = z.object({
  providerId: ProviderId,
  period: AnalyticsPeriod,
  totalReceived: z.number().int().min(0),
  totalReplied: z.number().int().min(0),
  responseRate: z.number().min(0).max(1),
  avgResponseMinutes: z.number().min(0).nullable(),
  changeVsPrevious: z.number(),
  daily: z.array(DailyBucket),
});
export type MessageStatsResponse = z.infer<typeof MessageStatsResponse>;

// ─── Phone Call Clicks ────────────────────────────────────────────────────────

export const PhoneCallClicksResponse = z.object({
  providerId: ProviderId,
  period: AnalyticsPeriod,
  total: z.number().int().min(0),
  changeVsPrevious: z.number(),
  daily: z.array(DailyBucket),
});
export type PhoneCallClicksResponse = z.infer<typeof PhoneCallClicksResponse>;

// ─── Website Clicks ───────────────────────────────────────────────────────────

export const WebsiteClicksResponse = z.object({
  providerId: ProviderId,
  period: AnalyticsPeriod,
  total: z.number().int().min(0),
  changeVsPrevious: z.number(),
  daily: z.array(DailyBucket),
});
export type WebsiteClicksResponse = z.infer<typeof WebsiteClicksResponse>;

// ─── Demographics (stub) ──────────────────────────────────────────────────────

export const DemographicsResponse = z.object({
  providerId: ProviderId,
  available: z.literal(false),
  reason: z.string(),
});
export type DemographicsResponse = z.infer<typeof DemographicsResponse>;

// ─── Review Summary ───────────────────────────────────────────────────────────

export const RatingDistribution = z.object({
  star: z.number().int().min(1).max(5),
  count: z.number().int().min(0),
  pct: z.number().min(0).max(1),
});
export type RatingDistribution = z.infer<typeof RatingDistribution>;

export const SentimentTrend = z.object({
  date: z.string().date(),
  positive: z.number().int().min(0),
  neutral: z.number().int().min(0),
  negative: z.number().int().min(0),
});
export type SentimentTrend = z.infer<typeof SentimentTrend>;

export const ReviewSummaryResponse = z.object({
  providerId: ProviderId,
  period: AnalyticsPeriod,
  avgRating: estimate(z.number().min(1).max(5)).nullable(),
  totalReviews: z.number().int().min(0),
  unansweredCount: z.number().int().min(0),
  responseRate: z.number().min(0).max(1),
  distribution: z.array(RatingDistribution),
  sentimentTrend: z.array(SentimentTrend),
  topKeywords: z.array(z.object({ word: z.string(), count: z.number().int(), sentiment: z.enum(['positive', 'neutral', 'negative']) })),
  changeVsPrevious: z.object({ avgRating: z.number(), totalReviews: z.number() }),
});
export type ReviewSummaryResponse = z.infer<typeof ReviewSummaryResponse>;

// ─── Peak Visit Times ─────────────────────────────────────────────────────────

export const PeakVisitTimesResponse = z.object({
  providerId: ProviderId,
  hourly: z.array(HourlyScore),
  bestHour: z.number().int().min(0).max(23),
  peakHour: z.number().int().min(0).max(23),
  estimatedWaitMinutes: estimate(z.number().min(0)),
});
export type PeakVisitTimesResponse = z.infer<typeof PeakVisitTimesResponse>;

// ─── Competitor Comparison ────────────────────────────────────────────────────

export const CompetitorComparisonResponse = z.object({
  providerId: ProviderId,
  rank: z.number().int().min(1),
  totalInCategory: z.number().int().min(1),
  percentile: z.number().min(0).max(1),
  yourAvgRating: z.number().min(0).max(5).nullable(),
  categoryAvgRating: z.number().min(0).max(5).nullable(),
  yourResponseRate: z.number().min(0).max(1).nullable(),
  categoryAvgResponseRate: z.number().min(0).max(1).nullable(),
  yourViewsRank: z.number().int().min(1).nullable(),
  position: z.enum(['above_avg', 'avg', 'below_avg']),
});
export type CompetitorComparisonResponse = z.infer<typeof CompetitorComparisonResponse>;

// ─── Search Keywords ──────────────────────────────────────────────────────────

export const SearchKeywordsResponse = z.object({
  providerId: ProviderId,
  period: AnalyticsPeriod,
  keywords: z.array(z.object({
    keyword: z.string(),
    count: z.number().int().min(0),
    pct: z.number().min(0).max(1),
  })),
});
export type SearchKeywordsResponse = z.infer<typeof SearchKeywordsResponse>;

// ─── Conversion Funnel ────────────────────────────────────────────────────────

export const ConversionFunnelResponse = z.object({
  providerId: ProviderId,
  period: AnalyticsPeriod,
  impressions: z.number().int().min(0),
  profileViews: z.number().int().min(0),
  actions: z.number().int().min(0),
  impressionToViewRate: z.number().min(0).max(1).nullable(),
  viewToActionRate: z.number().min(0).max(1).nullable(),
  overallConversionRate: z.number().min(0).max(1).nullable(),
});
export type ConversionFunnelResponse = z.infer<typeof ConversionFunnelResponse>;

// ─── Export Report ────────────────────────────────────────────────────────────

export const ExportReportResponse = z.object({
  csvData: z.string(),
  filename: z.string(),
  generatedAt: z.string().datetime(),
});
export type ExportReportResponse = z.infer<typeof ExportReportResponse>;

// ─── Combined Dashboard ───────────────────────────────────────────────────────

export const BusinessAnalyticsSummary = z.object({
  providerId: ProviderId,
  period: AnalyticsPeriod,
  profileViews: z.number().int().min(0),
  searchImpressions: z.number().int().min(0),
  messageCount: z.number().int().min(0),
  directionRequests: z.number().int().min(0),
  phoneClicks: z.number().int().min(0),
  websiteClicks: z.number().int().min(0),
  avgRating: z.number().min(0).max(5).nullable(),
  reviewCount: z.number().int().min(0),
  changeVsPrevious: z.object({
    profileViews: z.number(),
    searchImpressions: z.number(),
    messageCount: z.number(),
    directionRequests: z.number(),
  }),
});
export type BusinessAnalyticsSummary = z.infer<typeof BusinessAnalyticsSummary>;

// ─── Contract ─────────────────────────────────────────────────────────────────

const PeriodQuery = z.object({ period: AnalyticsPeriod.optional() });

export const businessAnalyticsContract = c.router(
  {
    summary: {
      method: 'GET',
      path: '/providers/:providerId/analytics/summary',
      pathParams: z.object({ providerId: ProviderId }),
      query: PeriodQuery,
      responses: { 200: BusinessAnalyticsSummary, 401: Problem, 403: Problem, 404: Problem },
      summary: 'Combined analytics summary for dashboard',
    },
    profileViews: {
      method: 'GET',
      path: '/providers/:providerId/analytics/profile-views',
      pathParams: z.object({ providerId: ProviderId }),
      query: PeriodQuery,
      responses: { 200: ProfileViewsResponse, 401: Problem, 403: Problem, 404: Problem },
      summary: 'Daily profile view counts',
    },
    searchImpressions: {
      method: 'GET',
      path: '/providers/:providerId/analytics/search-impressions',
      pathParams: z.object({ providerId: ProviderId }),
      query: PeriodQuery,
      responses: { 200: SearchImpressionsResponse, 401: Problem, 403: Problem, 404: Problem },
      summary: 'How often the provider appeared in search results',
    },
    directionRequests: {
      method: 'GET',
      path: '/providers/:providerId/analytics/direction-requests',
      pathParams: z.object({ providerId: ProviderId }),
      query: PeriodQuery,
      responses: { 200: DirectionRequestsResponse, 401: Problem, 403: Problem, 404: Problem },
      summary: 'Direction / navigation requests',
    },
    messageStats: {
      method: 'GET',
      path: '/providers/:providerId/analytics/message-stats',
      pathParams: z.object({ providerId: ProviderId }),
      query: PeriodQuery,
      responses: { 200: MessageStatsResponse, 401: Problem, 403: Problem, 404: Problem },
      summary: 'Message counts and response rate',
    },
    phoneCallClicks: {
      method: 'GET',
      path: '/providers/:providerId/analytics/phone-clicks',
      pathParams: z.object({ providerId: ProviderId }),
      query: PeriodQuery,
      responses: { 200: PhoneCallClicksResponse, 401: Problem, 403: Problem, 404: Problem },
      summary: 'Phone number tap counts',
    },
    websiteClicks: {
      method: 'GET',
      path: '/providers/:providerId/analytics/website-clicks',
      pathParams: z.object({ providerId: ProviderId }),
      query: PeriodQuery,
      responses: { 200: WebsiteClicksResponse, 401: Problem, 403: Problem, 404: Problem },
      summary: 'Website link tap counts',
    },
    demographics: {
      method: 'GET',
      path: '/providers/:providerId/analytics/demographics',
      pathParams: z.object({ providerId: ProviderId }),
      responses: { 200: DemographicsResponse, 401: Problem, 403: Problem, 404: Problem },
      summary: 'Age/gender demographics (stub until real data available)',
    },
    reviewSummary: {
      method: 'GET',
      path: '/providers/:providerId/analytics/review-summary',
      pathParams: z.object({ providerId: ProviderId }),
      query: PeriodQuery,
      responses: { 200: ReviewSummaryResponse, 401: Problem, 403: Problem, 404: Problem },
      summary: 'Review analytics: distribution, sentiment, keywords',
    },
    peakVisitTimes: {
      method: 'GET',
      path: '/providers/:providerId/analytics/peak-times',
      pathParams: z.object({ providerId: ProviderId }),
      responses: { 200: PeakVisitTimesResponse, 401: Problem, 403: Problem, 404: Problem },
      summary: 'Hourly heatmap of peak visit activity',
    },
    competitorComparison: {
      method: 'GET',
      path: '/providers/:providerId/analytics/competitor-comparison',
      pathParams: z.object({ providerId: ProviderId }),
      responses: { 200: CompetitorComparisonResponse, 401: Problem, 403: Problem, 404: Problem },
      summary: 'Anonymous rank vs similar providers in same category',
    },
    searchKeywords: {
      method: 'GET',
      path: '/providers/:providerId/analytics/search-keywords',
      pathParams: z.object({ providerId: ProviderId }),
      query: PeriodQuery,
      responses: { 200: SearchKeywordsResponse, 401: Problem, 403: Problem, 404: Problem },
      summary: 'Search queries that led to this provider',
    },
    conversionFunnel: {
      method: 'GET',
      path: '/providers/:providerId/analytics/conversion-funnel',
      pathParams: z.object({ providerId: ProviderId }),
      query: PeriodQuery,
      responses: { 200: ConversionFunnelResponse, 401: Problem, 403: Problem, 404: Problem },
      summary: 'Impressions → views → actions funnel',
    },
    exportReport: {
      method: 'GET',
      path: '/providers/:providerId/analytics/export',
      pathParams: z.object({ providerId: ProviderId }),
      query: PeriodQuery,
      responses: { 200: ExportReportResponse, 401: Problem, 403: Problem, 404: Problem },
      summary: 'CSV export of all analytics for the period',
    },
  },
  { pathPrefix: '/v1', strictStatusCodes: true },
);
