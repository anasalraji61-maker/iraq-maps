/**
 * BusinessAnalyticsService — provider-facing analytics backend.
 *
 * All crowd-sourced metrics use Estimate<T> (source, observedAt, confidence).
 * Stats are currently in-memory with deterministic stub data so the mobile
 * UI can be developed end-to-end before real event ingestion is wired up.
 * Real ingestion will replace the stub generators; the contract shapes are frozen.
 */

import type { Clock, ProviderId } from '@iraq-maps/contracts';
import type {
  AnalyticsPeriod,
  BusinessAnalyticsSummary,
  CompetitorComparisonResponse,
  ConversionFunnelResponse,
  DailyBucket,
  DemographicsResponse,
  DirectionRequestsResponse,
  ExportReportResponse,
  MessageStatsResponse,
  PeakVisitTimesResponse,
  PhoneCallClicksResponse,
  ProfileViewsResponse,
  ReviewSummaryResponse,
  SearchImpressionsResponse,
  SearchKeywordsResponse,
  WebsiteClicksResponse,
} from '@iraq-maps/contracts';

/** Cast a raw string to branded ProviderId — valid only inside this service where the caller controls the id. */
function pid(id: string): ProviderId { return id as ProviderId; }

// ─── Internal event types ─────────────────────────────────────────────────────

type EventKind =
  | 'profile_view'
  | 'search_impression'
  | 'direction_request'
  | 'message_received'
  | 'message_replied'
  | 'phone_click'
  | 'website_click'
  | 'search_keyword';

interface AnalyticsEvent {
  kind: EventKind;
  providerId: string;
  occurredAt: Date;
  /** Optional payload (e.g. keyword string) */
  payload?: string;
}

interface ReviewRecord {
  providerId: string;
  rating: number; // 1–5
  sentiment: 'positive' | 'neutral' | 'negative';
  keywords: string[];
  answered: boolean;
  createdAt: Date;
  responseTimeMs?: number;
}

// ─── Period helpers ───────────────────────────────────────────────────────────

function periodDays(period: AnalyticsPeriod): number {
  switch (period) {
    case '7d': return 7;
    case '30d': return 30;
    case '90d': return 90;
    case '1y': return 365;
  }
}

function cutoffFor(now: Date, period: AnalyticsPeriod): Date {
  return new Date(now.getTime() - periodDays(period) * 24 * 60 * 60 * 1000);
}

function prevCutoffFor(now: Date, period: AnalyticsPeriod): { start: Date; end: Date } {
  const days = periodDays(period);
  const end = cutoffFor(now, period);
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end };
}

function dateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildDailyBuckets(
  events: AnalyticsEvent[],
  now: Date,
  period: AnalyticsPeriod,
): DailyBucket[] {
  const days = periodDays(period);
  const result: DailyBucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = dateString(d);
    result.push({ date: key, count: 0 });
  }
  const cutoff = cutoffFor(now, period);
  for (const ev of events) {
    if (ev.occurredAt < cutoff) continue;
    const key = dateString(ev.occurredAt);
    const bucket = result.find((b) => b.date === key);
    if (bucket) bucket.count++;
  }
  return result;
}

function changePct(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 1 : 0;
  return (current - previous) / previous;
}

// ─── Stub data generator ──────────────────────────────────────────────────────
// Produces plausible deterministic data so charts are populated during dev.

function stubMultiplier(providerId: string): number {
  let h = 0;
  for (let i = 0; i < providerId.length; i++) h = ((h << 5) - h + providerId.charCodeAt(i)) | 0;
  return 0.5 + Math.abs(h % 100) / 100;
}

function generateStubEvents(
  providerId: string,
  kind: EventKind,
  now: Date,
  days: number,
  basePerDay: number,
): AnalyticsEvent[] {
  const m = stubMultiplier(providerId);
  const events: AnalyticsEvent[] = [];
  for (let d = 0; d < days; d++) {
    const dayBase = Math.round(basePerDay * m * (0.7 + 0.6 * Math.sin(d * 0.4)));
    const dayMs = now.getTime() - (days - 1 - d) * 24 * 60 * 60 * 1000;
    for (let i = 0; i < dayBase; i++) {
      const offsetMs = Math.floor(Math.random() * 24 * 60 * 60 * 1000);
      events.push({ kind, providerId, occurredAt: new Date(dayMs + offsetMs) });
    }
  }
  return events;
}

function generateStubKeywordEvents(
  providerId: string,
  now: Date,
  days: number,
): AnalyticsEvent[] {
  const keywords = ['مطعم', 'كافيه', 'وجبات', 'قهوة', 'فطور', 'غداء', 'عشاء', 'شاي', 'حلويات', 'مشاوي'];
  const m = stubMultiplier(providerId);
  const events: AnalyticsEvent[] = [];
  for (let d = 0; d < days; d++) {
    const dayMs = now.getTime() - (days - 1 - d) * 24 * 60 * 60 * 1000;
    const count = Math.round(8 * m);
    for (let i = 0; i < count; i++) {
      const kw = keywords[Math.floor((i + d) % keywords.length)]!;
      events.push({ kind: 'search_keyword', providerId, occurredAt: new Date(dayMs + i * 1000), payload: kw });
    }
  }
  return events;
}

function generateStubReviews(providerId: string, now: Date, days: number): ReviewRecord[] {
  const m = stubMultiplier(providerId);
  const allKeywords = ['سريع', 'نظيف', 'مميز', 'رائع', 'ممتاز', 'جيد', 'بطيء', 'غالي', 'مزدحم', 'هادئ'];
  const reviews: ReviewRecord[] = [];
  const total = Math.round(40 * m);
  for (let i = 0; i < total; i++) {
    const daysAgo = Math.floor((i / total) * days);
    const rating = Math.min(5, Math.max(1, Math.round(3.5 + m * 1.5 - (i % 5 === 0 ? 2 : 0))));
    const sentiment: 'positive' | 'neutral' | 'negative' =
      rating >= 4 ? 'positive' : rating === 3 ? 'neutral' : 'negative';
    const kwCount = 1 + (i % 3);
    const keywords = allKeywords.slice(i % allKeywords.length, (i % allKeywords.length) + kwCount);
    reviews.push({
      providerId,
      rating,
      sentiment,
      keywords,
      answered: i % 3 !== 0,
      createdAt: new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000),
      responseTimeMs: i % 3 !== 0 ? (1 + (i % 8)) * 60 * 60 * 1000 : undefined,
    });
  }
  return reviews;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class BusinessAnalyticsService {
  constructor(private readonly clock: Clock) {}

  // ─── Profile Views ──────────────────────────────────────────────────────────

  getProfileViews(providerId: string, period: AnalyticsPeriod): ProfileViewsResponse {
    const now = this.clock.now();
    const days = periodDays(period);
    const events = generateStubEvents(providerId, 'profile_view', now, days, 30);
    const prev = prevCutoffFor(now, period);
    const cutoff = cutoffFor(now, period);

    const currentTotal = events.filter((e) => e.occurredAt >= cutoff).length;
    const prevTotal = events.filter((e) => e.occurredAt >= prev.start && e.occurredAt < prev.end).length;

    return {
      providerId: pid(providerId),
      period,
      total: currentTotal,
      changeVsPrevious: changePct(currentTotal, prevTotal),
      daily: buildDailyBuckets(events.filter((e) => e.occurredAt >= cutoff), now, period),
    };
  }

  // ─── Search Impressions ─────────────────────────────────────────────────────

  getSearchImpressions(providerId: string, period: AnalyticsPeriod): SearchImpressionsResponse {
    const now = this.clock.now();
    const days = periodDays(period);
    const events = generateStubEvents(providerId, 'search_impression', now, days, 80);
    const prev = prevCutoffFor(now, period);
    const cutoff = cutoffFor(now, period);

    const currentTotal = events.filter((e) => e.occurredAt >= cutoff).length;
    const prevTotal = events.filter((e) => e.occurredAt >= prev.start && e.occurredAt < prev.end).length;

    return {
      providerId: pid(providerId),
      period,
      total: currentTotal,
      changeVsPrevious: changePct(currentTotal, prevTotal),
      daily: buildDailyBuckets(events.filter((e) => e.occurredAt >= cutoff), now, period),
    };
  }

  // ─── Direction Requests ─────────────────────────────────────────────────────

  getDirectionRequests(providerId: string, period: AnalyticsPeriod): DirectionRequestsResponse {
    const now = this.clock.now();
    const days = periodDays(period);
    const events = generateStubEvents(providerId, 'direction_request', now, days, 10);
    const prev = prevCutoffFor(now, period);
    const cutoff = cutoffFor(now, period);

    const currentTotal = events.filter((e) => e.occurredAt >= cutoff).length;
    const prevTotal = events.filter((e) => e.occurredAt >= prev.start && e.occurredAt < prev.end).length;

    return {
      providerId: pid(providerId),
      period,
      total: currentTotal,
      changeVsPrevious: changePct(currentTotal, prevTotal),
      daily: buildDailyBuckets(events.filter((e) => e.occurredAt >= cutoff), now, period),
    };
  }

  // ─── Message Stats ──────────────────────────────────────────────────────────

  getMessageStats(providerId: string, period: AnalyticsPeriod): MessageStatsResponse {
    const now = this.clock.now();
    const days = periodDays(period);
    const m = stubMultiplier(providerId);
    const receivedEvents = generateStubEvents(providerId, 'message_received', now, days, 12);
    const repliedEvents = generateStubEvents(providerId, 'message_replied', now, days, Math.round(12 * m * 0.75));
    const prev = prevCutoffFor(now, period);
    const cutoff = cutoffFor(now, period);

    const received = receivedEvents.filter((e) => e.occurredAt >= cutoff);
    const replied = repliedEvents.filter((e) => e.occurredAt >= cutoff);
    const prevReceived = receivedEvents.filter((e) => e.occurredAt >= prev.start && e.occurredAt < prev.end).length;

    const responseRate = received.length > 0 ? Math.min(1, replied.length / received.length) : 0;
    const avgResponseMinutes = replied.length > 0 ? Math.round(45 * m + 15) : null;

    return {
      providerId: pid(providerId),
      period,
      totalReceived: received.length,
      totalReplied: replied.length,
      responseRate,
      avgResponseMinutes,
      changeVsPrevious: changePct(received.length, prevReceived),
      daily: buildDailyBuckets(received, now, period),
    };
  }

  // ─── Phone Call Clicks ──────────────────────────────────────────────────────

  getPhoneCallClicks(providerId: string, period: AnalyticsPeriod): PhoneCallClicksResponse {
    const now = this.clock.now();
    const days = periodDays(period);
    const events = generateStubEvents(providerId, 'phone_click', now, days, 6);
    const prev = prevCutoffFor(now, period);
    const cutoff = cutoffFor(now, period);

    const currentTotal = events.filter((e) => e.occurredAt >= cutoff).length;
    const prevTotal = events.filter((e) => e.occurredAt >= prev.start && e.occurredAt < prev.end).length;

    return {
      providerId: pid(providerId),
      period,
      total: currentTotal,
      changeVsPrevious: changePct(currentTotal, prevTotal),
      daily: buildDailyBuckets(events.filter((e) => e.occurredAt >= cutoff), now, period),
    };
  }

  // ─── Website Clicks ─────────────────────────────────────────────────────────

  getWebsiteClicks(providerId: string, period: AnalyticsPeriod): WebsiteClicksResponse {
    const now = this.clock.now();
    const days = periodDays(period);
    const events = generateStubEvents(providerId, 'website_click', now, days, 4);
    const prev = prevCutoffFor(now, period);
    const cutoff = cutoffFor(now, period);

    const currentTotal = events.filter((e) => e.occurredAt >= cutoff).length;
    const prevTotal = events.filter((e) => e.occurredAt >= prev.start && e.occurredAt < prev.end).length;

    return {
      providerId: pid(providerId),
      period,
      total: currentTotal,
      changeVsPrevious: changePct(currentTotal, prevTotal),
      daily: buildDailyBuckets(events.filter((e) => e.occurredAt >= cutoff), now, period),
    };
  }

  // ─── Demographics (stub) ────────────────────────────────────────────────────

  getDemographics(providerId: string): DemographicsResponse {
    return {
      providerId: pid(providerId),
      available: false,
      reason: 'Demographics data requires opt-in from users. Not yet available.',
    };
  }

  // ─── Review Summary ─────────────────────────────────────────────────────────

  getReviewSummary(providerId: string, period: AnalyticsPeriod): ReviewSummaryResponse {
    const now = this.clock.now();
    const days = periodDays(period);
    const cutoff = cutoffFor(now, period);
    const prev = prevCutoffFor(now, period);

    const allReviews = generateStubReviews(providerId, now, days);
    const current = allReviews.filter((r) => r.createdAt >= cutoff);
    const prevReviews = allReviews.filter((r) => r.createdAt >= prev.start && r.createdAt < prev.end);

    const totalReviews = current.length;
    const unansweredCount = current.filter((r) => !r.answered).length;
    const answeredCount = current.filter((r) => r.answered).length;
    const responseRate = totalReviews > 0 ? answeredCount / totalReviews : 0;

    const ratingSum = current.reduce((s, r) => s + r.rating, 0);
    const avgRatingValue = totalReviews > 0 ? ratingSum / totalReviews : null;

    const prevAvg = prevReviews.length > 0
      ? prevReviews.reduce((s, r) => s + r.rating, 0) / prevReviews.length
      : null;

    // Distribution
    const distribution = [5, 4, 3, 2, 1].map((star) => {
      const count = current.filter((r) => r.rating === star).length;
      return { star, count, pct: totalReviews > 0 ? count / totalReviews : 0 };
    });

    // Sentiment trend: weekly buckets
    const weekCount = Math.min(Math.ceil(days / 7), 12);
    const sentimentTrend = Array.from({ length: weekCount }, (_, i) => {
      const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
      const weekReviews = current.filter((r) => r.createdAt >= weekStart && r.createdAt < weekEnd);
      return {
        date: dateString(weekStart),
        positive: weekReviews.filter((r) => r.sentiment === 'positive').length,
        neutral: weekReviews.filter((r) => r.sentiment === 'neutral').length,
        negative: weekReviews.filter((r) => r.sentiment === 'negative').length,
      };
    }).reverse();

    // Top keywords
    const kwMap = new Map<string, { count: number; sentiment: 'positive' | 'neutral' | 'negative' }>();
    for (const review of current) {
      for (const kw of review.keywords) {
        const existing = kwMap.get(kw);
        if (existing) {
          existing.count++;
        } else {
          kwMap.set(kw, { count: 1, sentiment: review.sentiment });
        }
      }
    }
    const topKeywords = [...kwMap.entries()]
      .map(([word, { count, sentiment }]) => ({ word, count, sentiment }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    return {
      providerId: pid(providerId),
      period,
      avgRating: avgRatingValue !== null ? {
        value: Math.round(avgRatingValue * 10) / 10,
        source: 'user_report',
        observedAt: now.toISOString(),
        confidence: Math.min(0.4 + totalReviews * 0.02, 0.95),
      } : null,
      totalReviews,
      unansweredCount,
      responseRate,
      distribution,
      sentimentTrend,
      topKeywords,
      changeVsPrevious: {
        avgRating: avgRatingValue !== null && prevAvg !== null ? avgRatingValue - prevAvg : 0,
        totalReviews: changePct(totalReviews, prevReviews.length),
      },
    };
  }

  // ─── Peak Visit Times ────────────────────────────────────────────────────────

  getPeakVisitTimes(providerId: string): PeakVisitTimesResponse {
    const now = this.clock.now();
    const m = stubMultiplier(providerId);

    // Typical Iraqi business hours: busy 11-13 and 18-21
    const baseByHour = [
      2, 1, 1, 1, 1, 2, 4, 8, 12, 18, 25, 35, 40, 38, 30, 22, 18, 28, 45, 55, 50, 35, 20, 8,
    ];

    const hourly = baseByHour.map((base, hour) => {
      const count = Math.round(base * m * (0.8 + Math.sin(hour) * 0.2));
      const maxBase = Math.max(...baseByHour) * m;
      return {
        hour,
        score: Math.min(100, Math.round((count / maxBase) * 100)),
        count,
      };
    });

    const peakHour = hourly.reduce((max, h) => (h.score > hourly[max]!.score ? h.hour : max), 0);
    const bestHour = hourly
      .filter((h) => h.hour >= 6 && h.hour <= 22)
      .reduce((min, h) => (h.score < hourly[min]!.score ? h.hour : min), 9);

    const peakScore = hourly[peakHour]?.score ?? 0;
    const waitMinutes = peakScore > 75 ? 20 : peakScore > 50 ? 10 : 3;

    return {
      providerId: pid(providerId),
      hourly,
      bestHour,
      peakHour,
      estimatedWaitMinutes: {
        value: waitMinutes,
        source: 'heuristic',
        observedAt: now.toISOString(),
        confidence: 0.5,
      },
    };
  }

  // ─── Competitor Comparison ───────────────────────────────────────────────────

  getCompetitorComparison(providerId: string): CompetitorComparisonResponse {
    const now = this.clock.now();
    const m = stubMultiplier(providerId);
    const totalInCategory = 18 + Math.round(m * 12);
    const rank = Math.max(1, Math.round(totalInCategory * (1 - m)));
    const percentile = 1 - rank / totalInCategory;

    const yourAvgRating = 3 + m * 2;
    const categoryAvgRating = 3.8;
    const yourResponseRate = 0.5 + m * 0.45;
    const categoryAvgResponseRate = 0.65;

    const position: 'above_avg' | 'avg' | 'below_avg' =
      percentile >= 0.66 ? 'above_avg' : percentile >= 0.33 ? 'avg' : 'below_avg';

    return {
      providerId: pid(providerId),
      rank,
      totalInCategory,
      percentile,
      yourAvgRating: Math.round(yourAvgRating * 10) / 10,
      categoryAvgRating,
      yourResponseRate: Math.round(yourResponseRate * 100) / 100,
      categoryAvgResponseRate,
      yourViewsRank: rank,
      position,
    };
    void now;
  }

  // ─── Search Keywords ─────────────────────────────────────────────────────────

  getSearchKeywords(providerId: string, period: AnalyticsPeriod): SearchKeywordsResponse {
    const now = this.clock.now();
    const days = periodDays(period);
    const events = generateStubKeywordEvents(providerId, now, days);
    const cutoff = cutoffFor(now, period);

    const relevant = events.filter((e) => e.occurredAt >= cutoff && e.payload);
    const kwMap = new Map<string, number>();
    for (const ev of relevant) {
      if (ev.payload) kwMap.set(ev.payload, (kwMap.get(ev.payload) ?? 0) + 1);
    }

    const total = relevant.length || 1;
    const keywords = [...kwMap.entries()]
      .map(([keyword, count]) => ({ keyword, count, pct: count / total }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    return {
      providerId: pid(providerId),
      period,
      keywords,
    };
  }

  // ─── Conversion Funnel ────────────────────────────────────────────────────────

  getConversionFunnel(providerId: string, period: AnalyticsPeriod): ConversionFunnelResponse {
    const now = this.clock.now();
    const days = periodDays(period);
    const m = stubMultiplier(providerId);
    const cutoff = cutoffFor(now, period);

    const impressionEvents = generateStubEvents(providerId, 'search_impression', now, days, 80);
    const viewEvents = generateStubEvents(providerId, 'profile_view', now, days, 30);
    const phoneEvents = generateStubEvents(providerId, 'phone_click', now, days, 6);
    const directionEvents = generateStubEvents(providerId, 'direction_request', now, days, 10);
    const msgEvents = generateStubEvents(providerId, 'message_received', now, days, 12);

    const impressions = impressionEvents.filter((e) => e.occurredAt >= cutoff).length;
    const profileViews = viewEvents.filter((e) => e.occurredAt >= cutoff).length;
    const actions = phoneEvents.filter((e) => e.occurredAt >= cutoff).length
      + directionEvents.filter((e) => e.occurredAt >= cutoff).length
      + msgEvents.filter((e) => e.occurredAt >= cutoff).length;

    void m;

    return {
      providerId: pid(providerId),
      period,
      impressions,
      profileViews,
      actions,
      impressionToViewRate: impressions > 0 ? profileViews / impressions : null,
      viewToActionRate: profileViews > 0 ? actions / profileViews : null,
      overallConversionRate: impressions > 0 ? actions / impressions : null,
    };
  }

  // ─── Combined Summary ─────────────────────────────────────────────────────────

  getSummary(providerId: string, period: AnalyticsPeriod): BusinessAnalyticsSummary {
    const views = this.getProfileViews(providerId, period);
    const impressions = this.getSearchImpressions(providerId, period);
    const messages = this.getMessageStats(providerId, period);
    const directions = this.getDirectionRequests(providerId, period);
    const phone = this.getPhoneCallClicks(providerId, period);
    const website = this.getWebsiteClicks(providerId, period);
    const reviews = this.getReviewSummary(providerId, period);

    return {
      providerId: pid(providerId),
      period,
      profileViews: views.total,
      searchImpressions: impressions.total,
      messageCount: messages.totalReceived,
      directionRequests: directions.total,
      phoneClicks: phone.total,
      websiteClicks: website.total,
      avgRating: reviews.avgRating?.value ?? null,
      reviewCount: reviews.totalReviews,
      changeVsPrevious: {
        profileViews: views.changeVsPrevious,
        searchImpressions: impressions.changeVsPrevious,
        messageCount: messages.changeVsPrevious,
        directionRequests: directions.changeVsPrevious,
      },
    };
  }

  // ─── CSV Export ───────────────────────────────────────────────────────────────

  getExportReport(providerId: string, period: AnalyticsPeriod): ExportReportResponse {
    const now = this.clock.now();
    const views = this.getProfileViews(providerId, period);
    const impressions = this.getSearchImpressions(providerId, period);
    const messages = this.getMessageStats(providerId, period);
    const directions = this.getDirectionRequests(providerId, period);
    const phone = this.getPhoneCallClicks(providerId, period);

    // Build CSV from daily buckets
    const dateMap = new Map<string, {
      views: number; impressions: number; messages: number; directions: number; phone: number;
    }>();

    const ensureDate = (date: string) => {
      if (!dateMap.has(date)) {
        dateMap.set(date, { views: 0, impressions: 0, messages: 0, directions: 0, phone: 0 });
      }
      return dateMap.get(date)!;
    };

    for (const b of views.daily) ensureDate(b.date).views = b.count;
    for (const b of impressions.daily) ensureDate(b.date).impressions = b.count;
    for (const b of messages.daily) ensureDate(b.date).messages = b.count;
    for (const b of directions.daily) ensureDate(b.date).directions = b.count;
    for (const b of phone.daily) ensureDate(b.date).phone = b.count;

    const rows = [...dateMap.entries()].sort(([a], [b]) => a.localeCompare(b));
    const header = 'Date,Profile Views,Search Impressions,Messages,Directions,Phone Clicks';
    const csvRows = rows.map(
      ([date, d]) => `${date},${d.views},${d.impressions},${d.messages},${d.directions},${d.phone}`,
    );
    const csvData = [header, ...csvRows].join('\n');

    return {
      csvData,
      filename: `analytics-${providerId}-${period}-${dateString(now)}.csv`,
      generatedAt: now.toISOString(),
    };
  }
}
