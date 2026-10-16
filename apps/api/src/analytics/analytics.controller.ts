/**
 * Analytics ingestion controller.
 *
 * POST /v1/analytics/events   — receive event batches from mobile clients
 * POST /v1/analytics/crashes  — receive crash reports
 * GET  /v1/analytics/summary  — admin-only summary metrics
 *
 * The ingestion endpoints are public (no auth required) because the mobile
 * app may call them before sign-in. They are rate-limited at the Fastify
 * layer. All data passes through PII stripping in AnalyticsService.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  UnauthorizedException,
  BadRequestException,
  Headers,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { MetricsDashboardService } from './metrics-dashboard';
import type { AnalyticsBatch } from '@iraq-maps/observability';
import { Public } from '@iraq-maps/identity';

// ── Crash report shape (mirrors crash-reporter.ts CrashReport) ─────────────────

interface CrashReport {
  id: string;
  type: string;
  error: {
    name: string;
    message: string;
    stack: { message: string; frames: unknown[]; raw: string };
  };
  context: Record<string, unknown>;
  deviceInfo: Record<string, unknown>;
  appVersion: string;
  timestamp: string;
  sessionId?: string;
}

// ── Controller ──────────────────────────────────────────────────────────────────

@Controller('v1/analytics')
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
    @Inject(MetricsDashboardService) private readonly dashboard: MetricsDashboardService,
    @Inject('ADMIN_KEY_REF') private readonly adminKeyRef: { value: string | undefined },
  ) {}

  // ── Event ingestion ───────────────────────────────────────────────────────

  @Public()
  @Post('events')
  @HttpCode(202)
  async ingestEvents(@Body() body: unknown): Promise<{ accepted: number; rejected: number }> {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Invalid body');
    }

    const batch = body as AnalyticsBatch;

    // Basic shape check
    if (!Array.isArray(batch.events)) {
      throw new BadRequestException('events must be an array');
    }
    if (batch.events.length > 200) {
      throw new BadRequestException('Too many events (max 200 per batch)');
    }

    const result = await this.analytics.ingestBatch(batch);
    return result;
  }

  // ── Crash ingestion ───────────────────────────────────────────────────────

  @Public()
  @Post('crashes')
  @HttpCode(202)
  async ingestCrash(@Body() body: unknown): Promise<{ received: boolean }> {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Invalid body');
    }

    const report = body as CrashReport;

    // Validate minimal required fields
    if (typeof report.id !== 'string' || typeof report.timestamp !== 'string') {
      throw new BadRequestException('Missing required fields: id, timestamp');
    }

    // Ingest crash as a special analytics event
    const batch: AnalyticsBatch = {
      events: [
        {
          event: `crash_${report.type ?? 'unknown'}`,
          properties: {
            crashId: report.id,
            errorName: report.error?.name ?? 'Unknown',
            errorMessage: report.error?.message ?? '',
            appVersion: report.appVersion ?? '',
            screen: (report.context?.screen as string | undefined) ?? undefined,
            frameCount: report.error?.stack?.frames?.length ?? 0,
          },
          timestamp: report.timestamp,
          sessionId: report.sessionId ?? 'crash-no-session',
          sequence: 0,
          userId: (report.context?.userId as string | undefined) ?? undefined,
        },
      ],
      device: (report.deviceInfo as AnalyticsBatch['device']) ?? {
        platform: 'unknown',
        osVersion: 'unknown',
        appVersion: report.appVersion ?? 'unknown',
        locale: 'ar',
        timezone: 'Asia/Baghdad',
        screenDp: '0x0',
      },
      sentAt: new Date().toISOString(),
    };

    await this.analytics.ingestBatch(batch);
    return { received: true };
  }

  // ── Admin summary ─────────────────────────────────────────────────────────

  @Get('summary')
  async getSummary(
    @Headers('x-admin-key') adminKey: string | undefined,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<unknown> {
    this._requireAdmin(adminKey);

    const startDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = to ? new Date(to) : new Date();

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid date format. Use ISO8601.');
    }

    const [dau, wau, mau, topEvents, trending, conversion, adoption, retention] =
      await Promise.all([
        this.analytics.getActiveUsers('dau'),
        this.analytics.getActiveUsers('wau'),
        this.analytics.getActiveUsers('mau'),
        this.analytics.getTopEvents(10, startDate),
        this.analytics.getTrendingSearches(10),
        this.analytics.getPlaceToMessageConversionRate(),
        this.analytics.getFeatureAdoption(),
        this.dashboard.getRetentionOverview(startDate, endDate),
      ]);

    return {
      activeUsers: { dau, wau, mau },
      topEvents,
      trendingSearches: trending,
      placeToMessage: conversion,
      featureAdoption: adoption,
      retention,
      period: { from: startDate.toISOString(), to: endDate.toISOString() },
    };
  }

  // ── Admin DAU time series ──────────────────────────────────────────────────

  @Get('dau')
  async getDailyActiveUsers(
    @Headers('x-admin-key') adminKey: string | undefined,
    @Query('days') daysStr?: string,
  ): Promise<unknown> {
    this._requireAdmin(adminKey);
    const days = Math.min(90, Math.max(1, parseInt(daysStr ?? '30', 10) || 30));
    return this.dashboard.getDailyActiveUsersSeries(days);
  }

  // ── Admin funnel ──────────────────────────────────────────────────────────

  @Get('funnel')
  async getFunnel(
    @Headers('x-admin-key') adminKey: string | undefined,
    @Query('steps') stepsParam?: string,
  ): Promise<unknown> {
    this._requireAdmin(adminKey);
    const steps = (stepsParam ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (steps.length < 2) throw new BadRequestException('Provide at least 2 comma-separated steps');
    return this.analytics.getUserFunnel(steps);
  }

  // ── Admin retention cohort ─────────────────────────────────────────────────

  @Get('retention')
  async getRetention(
    @Headers('x-admin-key') adminKey: string | undefined,
    @Query('cohortDate') cohortDateStr?: string,
    @Query('periods') periodsStr?: string,
  ): Promise<unknown> {
    this._requireAdmin(adminKey);
    const cohortDate = cohortDateStr ? new Date(cohortDateStr) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    if (isNaN(cohortDate.getTime())) throw new BadRequestException('Invalid cohortDate');
    const periods = Math.min(30, Math.max(1, parseInt(periodsStr ?? '7', 10) || 7));
    return this.analytics.getRetention(cohortDate, periods);
  }

  // ── Admin top events ──────────────────────────────────────────────────────

  @Get('top-events')
  async getTopEvents(
    @Headers('x-admin-key') adminKey: string | undefined,
    @Query('limit') limitStr?: string,
    @Query('from') from?: string,
  ): Promise<unknown> {
    this._requireAdmin(adminKey);
    const limit = Math.min(100, Math.max(1, parseInt(limitStr ?? '20', 10) || 20));
    const startDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return this.analytics.getTopEvents(limit, startDate);
  }

  // ── Admin trending searches ────────────────────────────────────────────────

  @Get('trending-searches')
  async getTrendingSearches(
    @Headers('x-admin-key') adminKey: string | undefined,
    @Query('limit') limitStr?: string,
  ): Promise<unknown> {
    this._requireAdmin(adminKey);
    const limit = Math.min(50, Math.max(1, parseInt(limitStr ?? '20', 10) || 20));
    return this.analytics.getTrendingSearches(limit);
  }

  // ── Admin provider response times ──────────────────────────────────────────

  @Get('provider-response-times')
  async getProviderResponseTimes(
    @Headers('x-admin-key') adminKey: string | undefined,
    @Query('limit') limitStr?: string,
  ): Promise<unknown> {
    this._requireAdmin(adminKey);
    const limit = Math.min(50, Math.max(1, parseInt(limitStr ?? '20', 10) || 20));
    return this.dashboard.getProviderResponseTimes(limit);
  }

  // ── Admin navigation sessions ──────────────────────────────────────────────

  @Get('navigation-sessions')
  async getNavigationSessions(
    @Headers('x-admin-key') adminKey: string | undefined,
  ): Promise<unknown> {
    this._requireAdmin(adminKey);
    return this.dashboard.getNavigationSessionStats();
  }

  // ── Admin search completion ────────────────────────────────────────────────

  @Get('search-completion')
  async getSearchCompletion(
    @Headers('x-admin-key') adminKey: string | undefined,
    @Query('from') from?: string,
  ): Promise<unknown> {
    this._requireAdmin(adminKey);
    const startDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return this.dashboard.getSearchCompletionRates(startDate);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _requireAdmin(key: string | undefined): void {
    const expected = this.adminKeyRef.value;
    if (!expected || key !== expected) {
      throw new UnauthorizedException('Admin key required');
    }
  }
}
