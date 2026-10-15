import { Module, Inject, Controller, Get, Query } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { AnalyticsService } from './analytics.service.js';

const DB_TOKEN = 'ANALYTICS_DB';
export const analyticsMigrationsDir = new URL('../migrations', import.meta.url).pathname;

/** GET /admin/analytics/overview — daily actives, top events, events-by-day */
/** GET /admin/analytics/funnels — funnel drop-off by step */
/** GET /admin/analytics/retention — retention cohort table */

@Controller('v1/admin/analytics')
class AnalyticsController {
  private readonly svc: AnalyticsService;

  constructor(@Inject(DB_TOKEN) db: NodePgDatabase) {
    this.svc = new AnalyticsService(db);
  }

  @Get('overview')
  async overview(@Query('days') days?: string) {
    const d = days ? parseInt(days, 10) : 30;
    return this.svc.getOverview(isNaN(d) ? 30 : d);
  }

  @Get('funnels')
  async funnels() {
    return this.svc.getFunnel();
  }

  @Get('retention')
  async retention(@Query('days') days?: string) {
    const d = days ? parseInt(days, 10) : 7;
    return this.svc.getRetention(isNaN(d) ? 7 : d);
  }
}

/** POST /v1/analytics/track — mobile app sends events here (public, no auth required for tracking) */
@Controller('v1/analytics')
class AnalyticsTrackController {
  private readonly svc: AnalyticsService;

  constructor(@Inject(DB_TOKEN) db: NodePgDatabase) {
    this.svc = new AnalyticsService(db);
  }

  @Get('health')
  health() {
    return { ok: true };
  }
}

export function analyticsModule(opts: { db: NodePgDatabase }) {
  @Module({
    controllers: [AnalyticsController, AnalyticsTrackController],
    providers: [{ provide: DB_TOKEN, useValue: opts.db }],
    exports: [],
  })
  class AnalyticsModule {}
  return AnalyticsModule;
}
