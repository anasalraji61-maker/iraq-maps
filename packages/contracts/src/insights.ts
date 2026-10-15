/**
 * M5 insights contracts: crowding estimates and price levels.
 * All values carry source, observedAt and confidence (CLAUDE.md rule 5).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { estimate, PlaceId, Problem } from './common';

const c = initContract();

/** @public frozen contract (M5) */
export const CrowdLevel = z.enum(['low', 'medium', 'high']);
export type CrowdLevel = z.infer<typeof CrowdLevel>;

/** @public frozen contract (M5) */
export const PriceLevel = z.enum(['budget', 'mid_range', 'expensive', 'luxury']);
export type PriceLevel = z.infer<typeof PriceLevel>;

/** Crowding estimate with provenance. @public frozen contract (M5) */
export const CrowdingEstimate = estimate(CrowdLevel);
export type CrowdingEstimate = z.infer<typeof CrowdingEstimate>;

/** Price level estimate with provenance. @public frozen contract (M5) */
export const PriceLevelEstimate = estimate(PriceLevel);
export type PriceLevelEstimate = z.infer<typeof PriceLevelEstimate>;

/** Full insights for a place. @public frozen contract (M5) */
export const PlaceInsights = z.object({
  placeId: PlaceId,
  /** null when there is no data (show «لا تتوفر بيانات»). */
  crowding: CrowdingEstimate.nullable(),
  /** null when there is no data. */
  priceLevel: PriceLevelEstimate.nullable(),
});
export type PlaceInsights = z.infer<typeof PlaceInsights>;

/** Report kinds users can submit. */
export const InsightReportKind = z.enum(['crowded_now', 'price', 'inaccuracy']);
export type InsightReportKind = z.infer<typeof InsightReportKind>;

export const InsightReport = z.object({
  placeId: PlaceId,
  kind: InsightReportKind,
  /** For kind=price: the level being reported. */
  priceLevel: PriceLevel.optional(),
});
export type InsightReport = z.infer<typeof InsightReport>;

/** @public frozen contract (M5), served by modules/insights */
export const insightsContract = c.router(
  {
    get: {
      method: 'GET',
      path: '/places/:id/insights',
      pathParams: z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).pipe(PlaceId) }),
      responses: { 200: PlaceInsights, 404: Problem },
      summary: 'Get crowding and price insights for a place',
    },
    report: {
      method: 'POST',
      path: '/insights/reports',
      body: InsightReport,
      responses: { 204: z.undefined(), 400: Problem, 429: Problem },
      summary: 'Submit a crowded-now or price report for a place',
    },
  },
  { pathPrefix: '/v1', strictStatusCodes: true },
);
