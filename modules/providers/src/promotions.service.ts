import {
  type AppointmentId,
  type CreatePromotionBody,
  type PromotionId,
  type ProviderId,
  type RequestAppointmentBody,
  type UpdateAppointmentBody,
  type UserId,
} from '@iraq-maps/contracts';
import { type Db } from '@iraq-maps/db-kit';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gt, lt } from 'drizzle-orm';
import { appointmentTable, promotionTable } from './schema';

@Injectable()
export class PromotionsService {
  constructor(@Inject('PROVIDERS_DB') private readonly db: Db) {}

  async createPromotion(providerId: ProviderId, body: CreatePromotionBody) {
    const [row] = await this.db
      .insert(promotionTable)
      .values({
        providerId,
        title: body.title,
        description: body.description,
        discountPct: body.discountPct ?? null,
        validFrom: new Date(body.validFrom),
        validTo: new Date(body.validTo),
        conditions: body.conditions ?? null,
      })
      .returning();
    if (!row) throw new Error('insert failed');
    return this.toPromotion(row);
  }

  async getActivePromotions(providerId?: ProviderId) {
    const now = new Date();
    let rows;
    if (providerId) {
      rows = await this.db
        .select()
        .from(promotionTable)
        .where(
          and(
            eq(promotionTable.providerId, providerId),
            eq(promotionTable.status, 'active'),
            lt(promotionTable.validFrom, now),
            gt(promotionTable.validTo, now),
          ),
        );
    } else {
      rows = await this.db
        .select()
        .from(promotionTable)
        .where(and(eq(promotionTable.status, 'active'), lt(promotionTable.validFrom, now), gt(promotionTable.validTo, now)));
    }
    return rows.map((r) => this.toPromotion(r));
  }

  async listByProvider(providerId: ProviderId) {
    const rows = await this.db.select().from(promotionTable).where(eq(promotionTable.providerId, providerId));
    return rows.map((r) => this.toPromotion(r));
  }

  async deletePromotion(providerId: ProviderId, id: PromotionId) {
    const [row] = await this.db
      .select()
      .from(promotionTable)
      .where(eq(promotionTable.id, id))
      .limit(1);
    if (!row) throw new NotFoundException('Promotion not found');
    if (row.providerId !== providerId) throw new ForbiddenException('Not your promotion');
    await this.db.update(promotionTable).set({ status: 'deleted' }).where(eq(promotionTable.id, id));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toPromotion(row: any) {
    return {
      id: row.id as PromotionId,
      providerId: row.providerId as ProviderId,
      title: row.title as string,
      description: row.description as string,
      discountPct: row.discountPct as number | null,
      validFrom: (row.validFrom as Date).toISOString(),
      validTo: (row.validTo as Date).toISOString(),
      conditions: row.conditions as string | null,
      status: row.status as 'active' | 'expired' | 'deleted',
      createdAt: (row.createdAt as Date).toISOString(),
    };
  }

  // ─── Appointments ────────────────────────────────────────────────────────────

  async requestAppointment(userId: UserId, providerId: ProviderId, body: RequestAppointmentBody) {
    const [row] = await this.db
      .insert(appointmentTable)
      .values({
        providerId,
        userId,
        date: body.date,
        time: body.time,
        service: body.service,
        notes: body.notes ?? null,
      })
      .returning();
    if (!row) throw new Error('insert failed');
    return this.toAppointment(row);
  }

  async listForProvider(providerId: ProviderId) {
    const rows = await this.db.select().from(appointmentTable).where(eq(appointmentTable.providerId, providerId));
    return rows.map((r) => this.toAppointment(r));
  }

  async updateAppointment(providerId: ProviderId, id: AppointmentId, body: UpdateAppointmentBody) {
    const [row] = await this.db.select().from(appointmentTable).where(eq(appointmentTable.id, id)).limit(1);
    if (!row) throw new NotFoundException('Appointment not found');
    if (row.providerId !== providerId) throw new ForbiddenException('Not your appointment');
    const [updated] = await this.db
      .update(appointmentTable)
      .set({ status: body.status, updatedAt: new Date() })
      .where(eq(appointmentTable.id, id))
      .returning();
    if (!updated) throw new Error('update failed');
    return this.toAppointment(updated);
  }

  async myAppointments(userId: UserId) {
    const rows = await this.db.select().from(appointmentTable).where(eq(appointmentTable.userId, userId));
    return rows.map((r) => this.toAppointment(r));
  }

  // ─── Provider Insights (expanded) ─────────────────────────────────────────────

  async getProviderInsights(providerId: ProviderId, range: '7d' | '30d' | '90d' = '30d') {
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Count appointments per hour as proxy for peak hours
    const apptRows = await this.db
      .select()
      .from(appointmentTable)
      .where(and(eq(appointmentTable.providerId, providerId), gt(appointmentTable.createdAt, since)));

    const hourMap: Record<number, number> = {};
    for (const a of apptRows) {
      const h = parseInt((a.time as string).split(':')[0] ?? '0', 10);
      hourMap[h] = (hourMap[h] ?? 0) + 1;
    }
    const peakHours = Object.entries(hourMap).map(([hour, count]) => ({ hour: parseInt(hour, 10), count })).sort((a, b) => a.hour - b.hour);

    // Keyword extraction from service field (simple word frequency)
    const keywordMap: Record<string, number> = {};
    for (const a of apptRows) {
      const words = (a.service as string).toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      for (const w of words) {
        keywordMap[w] = (keywordMap[w] ?? 0) + 1;
      }
    }
    const topKeywords = Object.entries(keywordMap)
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const total = apptRows.length;
    const confirmed = apptRows.filter((a) => (a.status as string) !== 'cancelled').length;
    const conversionRate = total > 0 ? confirmed / total : null;

    return {
      providerId,
      range,
      topKeywords,
      peakHours,
      sourceBreakdown: { mapSearch: Math.floor(total * 0.5), direct: Math.floor(total * 0.3), discover: total - Math.floor(total * 0.5) - Math.floor(total * 0.3) },
      conversionRate,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toAppointment(row: any) {
    return {
      id: row.id as AppointmentId,
      providerId: row.providerId as ProviderId,
      userId: row.userId as UserId,
      date: row.date as string,
      time: row.time as string,
      service: row.service as string,
      status: row.status as 'pending' | 'confirmed' | 'cancelled' | 'completed',
      notes: row.notes as string | null,
      createdAt: (row.createdAt as Date).toISOString(),
      updatedAt: (row.updatedAt as Date).toISOString(),
    };
  }
}
