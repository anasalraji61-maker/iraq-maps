/**
 * ModerationController — HTTP endpoints for content moderation.
 *
 * Public routes:
 *   POST /moderation/reports          — file a report (authenticated users)
 *
 * Admin routes (require x-admin-key or isAdmin guard):
 *   GET  /moderation/reports          — list reports with filters
 *   POST /moderation/reports/:id/act  — act on a report
 *   GET  /moderation/users/:id/history — user's moderation history
 *   GET  /moderation/users/banned     — list suspended / banned users
 *   POST /moderation/users/:id/warn   — issue direct warning
 *   POST /moderation/users/:id/suspend — direct suspend/ban
 *   DELETE /moderation/users/:id/suspension — lift suspension
 *   GET  /moderation/word-filter      — get word filter for locale
 *   POST /moderation/word-filter      — add/remove words
 *   POST /moderation/check            — check content (internal / admin)
 *   GET  /moderation/stats            — dashboard stats
 */
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ModerationService } from './moderation.service';
import type {
  ContentType,
  ModerationAction,
  ReportReason,
} from './schema';

const ADMIN_KEY = process.env['ADMIN_KEY'] ?? '';

function requireAdmin(key: string | undefined): void {
  if (!ADMIN_KEY || key !== ADMIN_KEY) {
    throw new ForbiddenException('Admin access required');
  }
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

interface FileReportBody {
  reporterId: string;
  contentId: string;
  contentType: ContentType;
  reason: ReportReason;
  details?: string;
}

interface ActOnReportBody {
  moderatorId: string;
  action: ModerationAction;
  note?: string;
}

interface UpdateWordFilterBody {
  words: string[];
  action: 'add' | 'remove';
  locale?: string;
}

interface CheckContentBody {
  text: string;
  userId?: string;
}

interface DirectActionBody {
  moderatorId: string;
  reason: string;
}

interface SuspendBody extends DirectActionBody {
  type: 'suspend' | 'ban';
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('moderation')
export class ModerationController {
  constructor(private readonly svc: ModerationService) {}

  // ── Public ────────────────────────────────────────────────────────────────

  @Post('reports')
  async fileReport(@Body() body: FileReportBody) {
    const report = await this.svc.reportContent(
      body.reporterId,
      body.contentId,
      body.contentType,
      body.reason,
      body.details,
    );
    return { ok: true, reportId: report.id };
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  @Get('reports')
  async getReports(
    @Headers('x-admin-key') key: string | undefined,
    @Query('status') status?: string,
    @Query('contentType') contentType?: string,
    @Query('reporterId') reporterId?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    requireAdmin(key);
    return this.svc.getReports(
      { status: status as import('./schema').ReportStatus | undefined, contentType: contentType as import('./schema').ContentType | undefined, reporterId },
      { limit: limit ? Number(limit) : undefined, cursor },
    );
  }

  @Post('reports/:id/act')
  async actOnReport(
    @Headers('x-admin-key') key: string | undefined,
    @Param('id') reportId: string,
    @Body() body: ActOnReportBody,
  ) {
    requireAdmin(key);
    return this.svc.moderateReport(body.moderatorId, reportId, body.action, body.note);
  }

  @Get('users/banned')
  async getBannedUsers(@Headers('x-admin-key') key: string | undefined) {
    requireAdmin(key);
    return this.svc.getBannedUsers();
  }

  @Get('users/:id/history')
  async getUserHistory(
    @Headers('x-admin-key') key: string | undefined,
    @Param('id') userId: string,
  ) {
    requireAdmin(key);
    return this.svc.getModerationHistory(userId);
  }

  @Get('users/:id/suspension')
  async getUserSuspension(
    @Headers('x-admin-key') key: string | undefined,
    @Param('id') userId: string,
  ) {
    requireAdmin(key);
    const s = await this.svc.getUserSuspension(userId);
    return { suspension: s };
  }

  @Post('users/:id/warn')
  async warnUser(
    @Headers('x-admin-key') key: string | undefined,
    @Param('id') userId: string,
    @Body() body: DirectActionBody,
  ) {
    requireAdmin(key);
    const warning = await this.svc.warnUser(userId, body.moderatorId, body.reason);
    return { ok: true, warning };
  }

  @Post('users/:id/suspend')
  async suspendUser(
    @Headers('x-admin-key') key: string | undefined,
    @Param('id') userId: string,
    @Body() body: SuspendBody,
  ) {
    requireAdmin(key);
    const suspension = await this.svc.suspendUser(userId, body.moderatorId, body.type, body.reason);
    return { ok: true, suspension };
  }

  @Delete('users/:id/suspension')
  async liftSuspension(
    @Headers('x-admin-key') key: string | undefined,
    @Param('id') userId: string,
  ) {
    requireAdmin(key);
    await this.svc.liftSuspension(userId);
    return { ok: true };
  }

  @Get('word-filter')
  async getWordFilter(
    @Headers('x-admin-key') key: string | undefined,
    @Query('locale') locale?: string,
  ) {
    requireAdmin(key);
    const words = await this.svc.getWordFilter(locale ?? 'ar');
    return { words };
  }

  @Post('word-filter')
  async updateWordFilter(
    @Headers('x-admin-key') key: string | undefined,
    @Body() body: UpdateWordFilterBody,
  ) {
    requireAdmin(key);
    await this.svc.updateWordFilter(body.words, body.action, body.locale ?? 'ar');
    return { ok: true };
  }

  @Post('check')
  async checkContent(
    @Headers('x-admin-key') key: string | undefined,
    @Body() body: CheckContentBody,
  ) {
    requireAdmin(key);
    return this.svc.checkContent(body.text, body.userId);
  }

  @Get('stats')
  async getStats(@Headers('x-admin-key') key: string | undefined) {
    requireAdmin(key);
    return this.svc.getStats();
  }
}
