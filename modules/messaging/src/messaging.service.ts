import type { ChannelAdapter, EventBus, UserDataEraser } from '@iraq-maps/contracts';
import {
  type InquiryId,
  type MessagingChannelKind,
  PortTokens,
  type PlaceId,
  type UserId,
} from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { and, count, eq, gt, lt, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { deliveryTable, inquiryTable, providerOptOutTable, replyTable } from './schema';

const DAILY_LIMIT = Number(process.env['MESSAGING_DAILY_LIMIT_PER_USER'] ?? 10);

@Injectable()
export class MessagingService implements UserDataEraser {
  readonly module = 'messaging';

  constructor(
    @Inject('MESSAGING_DB') private readonly db: Db,
    @Inject(PortTokens.MessagingChannelAdapter) private readonly channelAdapter: ChannelAdapter,
    @Inject('MESSAGING_QUEUE') private readonly queue: Queue,
    @Inject(PortTokens.EventBus) private readonly eventBus: EventBus,
  ) {}

  async createInquiry(
    userId: UserId,
    text: string,
    placeIds: PlaceId[],
    idempotencyKey: string,
  ) {
    if (placeIds.length > 5) {
      throw new BadRequestException({ code: 'too_many_places' });
    }

    // Idempotency check
    const existing = await this.db.select().from(inquiryTable).where(eq(inquiryTable.idempotencyKey, idempotencyKey)).limit(1);
    if (existing[0]) {
      return this.getInquiry(existing[0].id as InquiryId, userId);
    }

    // Daily limit check
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const countResult = await this.db
      .select({ value: count() })
      .from(inquiryTable)
      .where(and(eq(inquiryTable.userId, userId), gt(inquiryTable.createdAt, dayStart)));
    const dailyCount = countResult[0]?.value ?? 0;

    if (dailyCount >= DAILY_LIMIT) {
      throw new HttpException({ code: 'daily_limit_exceeded' }, HttpStatus.TOO_MANY_REQUESTS);
    }

    // Get opted-out providers
    const optedOut = await this.db.select().from(providerOptOutTable);
    const optedOutIds = new Set(optedOut.map((r) => r.providerId));

    // Create inquiry
    const [inquiry] = await this.db
      .insert(inquiryTable)
      .values({ userId, text, idempotencyKey })
      .returning();
    if (!inquiry) throw new Error('insert failed');

    // Create deliveries per place
    const deliveries = await Promise.all(
      placeIds.map(async (placeId) => {
        const channel = this.selectChannel(placeId, optedOutIds);
        const [delivery] = await this.db
          .insert(deliveryTable)
          .values({
            inquiryId: inquiry.id,
            placeId,
            channel: channel === null ? 'handoff' : channel,
            status: channel === null ? 'failed' : 'queued',
            handoffUrl: channel === null ? undefined : undefined,
            handoffCopyText: channel === null ? undefined : undefined,
          })
          .returning();
        return delivery!;
      }),
    );

    // Enqueue for delivery (skip opted-out)
    for (const delivery of deliveries) {
      if (delivery.status === 'queued') {
        await this.queue.add('send', { deliveryId: delivery.id });
      }
    }

    // Publish domain event
    await this.eventBus.publish({
      id: randomUUID(),
      name: 'messaging.inquiry.received.v1',
      occurredAt: new Date().toISOString(),
      payload: { inquiryId: inquiry.id, userId, placeIds: placeIds as string[] },
    });

    return this.toInquiryShape(inquiry, deliveries);
  }

  async getInquiry(id: InquiryId, userId: UserId) {
    const [inquiry] = await this.db
      .select()
      .from(inquiryTable)
      .where(and(eq(inquiryTable.id, id), eq(inquiryTable.userId, userId)))
      .limit(1);
    if (!inquiry) throw new NotFoundException({ code: 'not_found' });

    const deliveries = await this.db.select().from(deliveryTable).where(eq(deliveryTable.inquiryId, id));
    return this.toInquiryShape(inquiry, deliveries);
  }

  async listInquiries(userId: UserId, cursor?: string) {
    const limit = 20;
    const rows = await this.db
      .select()
      .from(inquiryTable)
      .where(cursor ? and(eq(inquiryTable.userId, userId), lt(inquiryTable.createdAt, new Date(cursor))) : eq(inquiryTable.userId, userId))
      .orderBy(sql`${inquiryTable.createdAt} DESC`)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    const results = await Promise.all(
      items.map(async (inq) => {
        const deliveries = await this.db.select().from(deliveryTable).where(eq(deliveryTable.inquiryId, inq.id));
        return this.toInquiryShape(inq, deliveries);
      }),
    );

    return {
      items: results,
      nextCursor: hasMore ? items[items.length - 1]?.createdAt.toISOString() : undefined,
    };
  }

  async providerReply(providerId: string, inquiryId: InquiryId, text: string) {
    // Find a delivery for this inquiry that targets one of this provider's places
    const delivery = await this.db
      .select()
      .from(deliveryTable)
      .where(and(eq(deliveryTable.inquiryId, inquiryId), eq(deliveryTable.placeId, providerId)))
      .limit(1);

    if (!delivery[0]) throw new NotFoundException({ code: 'not_found' });

    const [reply] = await this.db.insert(replyTable).values({ deliveryId: delivery[0].id, fromProvider: true, text }).returning();
    await this.db
      .update(deliveryTable)
      .set({ status: 'replied', updatedAt: new Date() })
      .where(eq(deliveryTable.id, delivery[0].id));

    // Publish domain event
    if (reply) {
      await this.eventBus.publish({
        id: randomUUID(),
        name: 'messaging.reply.received.v1',
        occurredAt: new Date().toISOString(),
        payload: { inquiryId, replyId: reply.id, fromProviderId: providerId },
      });
    }
  }

  async providerOptOut(providerId: string) {
    await this.db
      .insert(providerOptOutTable)
      .values({ providerId })
      .onConflictDoNothing();
  }

  async listProviderInbox(providerId: string, cursor?: string) {
    // Returns inquiries where a delivery targets this provider's claimed place
    // For now, returns deliveries by place_id matching provider
    const limit = 20;
    const rows = await this.db
      .select()
      .from(deliveryTable)
      .where(
        cursor
          ? and(eq(deliveryTable.placeId, providerId), lt(deliveryTable.updatedAt, new Date(cursor)))
          : eq(deliveryTable.placeId, providerId),
      )
      .orderBy(sql`${deliveryTable.updatedAt} DESC`)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    const results = await Promise.all(
      items.map(async (d) => {
        const [inq] = await this.db.select().from(inquiryTable).where(eq(inquiryTable.id, d.inquiryId)).limit(1);
        const deliveries = inq ? await this.db.select().from(deliveryTable).where(eq(deliveryTable.inquiryId, inq.id)) : [];
        return inq ? this.toInquiryShape(inq, deliveries) : null;
      }),
    );

    return {
      items: results.filter(Boolean),
      nextCursor: hasMore ? items[items.length - 1]?.updatedAt.toISOString() : undefined,
    };
  }

  async processDelivery(deliveryId: string) {
    const [delivery] = await this.db.select().from(deliveryTable).where(eq(deliveryTable.id, deliveryId)).limit(1);
    if (!delivery || delivery.status !== 'queued') return;

    const [inquiry] = await this.db.select().from(inquiryTable).where(eq(inquiryTable.id, delivery.inquiryId)).limit(1);
    if (!inquiry) return;

    try {
      const result = await this.channelAdapter.send({
        to: delivery.placeId,
        text: inquiry.text,
      });
      await this.db
        .update(deliveryTable)
        .set({ status: 'sent', externalId: result.externalId, updatedAt: new Date() })
        .where(eq(deliveryTable.id, deliveryId));
    } catch {
      await this.db
        .update(deliveryTable)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(deliveryTable.id, deliveryId));
    }
  }

  async handleInbound(rawBody: unknown, headers: Record<string, string>) {
    const msg = await this.channelAdapter.parseInbound(rawBody, headers);
    if (!msg) return;

    // Find delivery by externalId
    const [delivery] = await this.db
      .select()
      .from(deliveryTable)
      .where(eq(deliveryTable.externalId, msg.externalId))
      .limit(1);

    if (delivery) {
      const [reply] = await this.db.insert(replyTable).values({ deliveryId: delivery.id, fromProvider: true, text: msg.text }).returning();
      await this.db.update(deliveryTable).set({ status: 'replied', updatedAt: new Date() }).where(eq(deliveryTable.id, delivery.id));

      // Publish domain event
      if (reply) {
        await this.eventBus.publish({
          id: randomUUID(),
          name: 'messaging.reply.received.v1',
          occurredAt: new Date().toISOString(),
          payload: { inquiryId: delivery.inquiryId, replyId: reply.id, fromProviderId: msg.from },
        });
      }
    }
  }

  async erase(userId: UserId): Promise<void> {
    const inquiries = await this.db.select({ id: inquiryTable.id }).from(inquiryTable).where(eq(inquiryTable.userId, userId));
    for (const inq of inquiries) {
      const deliveries = await this.db.select({ id: deliveryTable.id }).from(deliveryTable).where(eq(deliveryTable.inquiryId, inq.id));
      for (const d of deliveries) {
        await this.db.delete(replyTable).where(eq(replyTable.deliveryId, d.id));
      }
      await this.db.delete(deliveryTable).where(eq(deliveryTable.inquiryId, inq.id));
    }
    await this.db.delete(inquiryTable).where(eq(inquiryTable.userId, userId));
  }

  private selectChannel(placeId: PlaceId, optedOutIds: Set<string>): MessagingChannelKind | null {
    if (optedOutIds.has(placeId)) return null; // will be marked failed
    // Default to in_app for MVP; WhatsApp requires explicit consent
    return 'in_app';
  }

  private toInquiryShape(
    inquiry: typeof inquiryTable.$inferSelect,
    deliveries: (typeof deliveryTable.$inferSelect)[],
  ) {
    return {
      id: inquiry.id as InquiryId,
      userId: inquiry.userId as UserId,
      text: inquiry.text,
      createdAt: inquiry.createdAt.toISOString(),
      targets: deliveries.map((d) => ({
        placeId: d.placeId as PlaceId,
        channel: d.channel as MessagingChannelKind,
        status: d.status as never,
        handoffLink:
          d.handoffUrl
            ? { type: 'wa_me' as const, url: d.handoffUrl, copyText: d.handoffCopyText ?? '' }
            : undefined,
      })),
    };
  }
}
