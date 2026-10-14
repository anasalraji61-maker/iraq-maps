import { randomUUID } from 'node:crypto';
import {
  type ConsentScope,
  type PhoneVerificationPort,
  type PlaceId,
  PortTokens,
  type ProviderId,
  type ProviderRecord,
  publicProfileOf,
  type PublicProviderProfile,
  type UserId,
  type AdminProviderView,
  type ConsentLedger,
  type ProviderMe,
} from '@iraq-maps/contracts';
import { createOutboxPublisher, type Db } from '@iraq-maps/db-kit';
import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { auditLogTable, consentTable, providerTable } from './schema';

export interface RegisterProviderInput {
  name: string;
  category: string;
  location?: [number, number] | null;
}

export interface UpdateProviderInput {
  name?: string;
  category?: string;
  location?: [number, number] | null;
  hoursRaw?: string | null;
  prices?: unknown[];
  links?: unknown[];
  photoAssetIds?: string[];
}

export interface ConsentEvidence {
  textVersion: string;
  locale: string;
}

@Injectable()
export class ProvidersService {
  private readonly outbox;

  constructor(
    @Inject('PROVIDERS_DB') private readonly db: Db,
    @Inject(PortTokens.PhoneVerificationPort) private readonly phoneVerification: PhoneVerificationPort,
  ) {
    this.outbox = createOutboxPublisher(db);
  }

  async register(userId: UserId, input: RegisterProviderInput): Promise<ProviderRow> {
    const existing = await this.db.execute<{ id: string }>(
      sql`SELECT id FROM providers.provider WHERE user_id = ${userId} LIMIT 1`,
    );
    if (existing.rows.length > 0) throw new ConflictException({ code: 'provider_exists', title: 'Already a provider' });

    const [row] = await this.db
      .insert(providerTable)
      .values({
        userId,
        name: input.name,
        category: input.category,
        location: input.location ? `SRID=4326;POINT(${input.location[0]} ${input.location[1]})` : undefined,
      })
      .returning();
    if (!row) throw new Error('insert failed');
    return row;
  }

  async getByUserId(userId: UserId): Promise<ProviderRow | null> {
    const [row] = await this.db.select().from(providerTable).where(eq(providerTable.userId, userId)).limit(1);
    return row ?? null;
  }

  async getById(providerId: ProviderId): Promise<ProviderRow | null> {
    const [row] = await this.db.select().from(providerTable).where(eq(providerTable.id, providerId)).limit(1);
    return row ?? null;
  }

  async update(userId: UserId, providerId: ProviderId, input: UpdateProviderInput): Promise<ProviderRow> {
    const provider = await this.getById(providerId);
    if (!provider) throw new NotFoundException({ code: 'provider_not_found', title: 'Provider not found' });
    this.assertOwner(userId, provider);

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.category !== undefined) updateData.category = input.category;
    if ('location' in input) updateData.location = input.location ? `SRID=4326;POINT(${input.location[0]} ${input.location[1]})` : null;
    if ('hoursRaw' in input) updateData.hoursRaw = input.hoursRaw ?? null;
    if (input.prices !== undefined) updateData.prices = JSON.stringify(input.prices);
    if (input.links !== undefined) updateData.links = JSON.stringify(input.links);
    if (input.photoAssetIds !== undefined) updateData.photoAssetIds = JSON.stringify(input.photoAssetIds);

    const [updated] = await this.db.update(providerTable).set(updateData as never).where(eq(providerTable.id, providerId)).returning();
    if (!updated) throw new NotFoundException({ code: 'provider_not_found', title: 'Provider not found' });

    await this.publishProfileUpdated(updated);
    return updated;
  }

  async startPhoneVerification(userId: UserId, providerId: ProviderId, phone: string, locale: string) {
    const provider = await this.getById(providerId);
    if (!provider) throw new NotFoundException({ code: 'provider_not_found', title: 'Provider not found' });
    this.assertOwner(userId, provider);

    const result = await this.phoneVerification.start({ phone: phone as never, locale: locale as never, purpose: 'provider_phone' });
    await this.db.update(providerTable).set({ phoneVerificationId: result.verificationId, businessPhone: phone, updatedAt: new Date() }).where(eq(providerTable.id, providerId));
    return result;
  }

  async confirmPhoneVerification(userId: UserId, providerId: ProviderId, verificationId: string, code: string): Promise<ProviderRow> {
    const provider = await this.getById(providerId);
    if (!provider) throw new NotFoundException({ code: 'provider_not_found', title: 'Provider not found' });
    this.assertOwner(userId, provider);

    const result = await this.phoneVerification.confirm({ verificationId, code });
    if (!result.verified) {
      const codeMap = { invalid: 'otp_invalid', expired: 'otp_expired', too_many_attempts: 'otp_too_many' } as const;
      throw new UnprocessableEntityException({ code: codeMap[result.reason], title: 'Verification failed' });
    }

    const [updated] = await this.db
      .update(providerTable)
      .set({ businessPhone: result.phone, businessPhoneVerifiedAt: new Date(), phoneVerificationId: null, updatedAt: new Date() })
      .where(eq(providerTable.id, providerId))
      .returning();
    return updated!;
  }

  async claimPlace(userId: UserId, providerId: ProviderId, placeId: PlaceId): Promise<ProviderRow> {
    const provider = await this.getById(providerId);
    if (!provider) throw new NotFoundException({ code: 'provider_not_found', title: 'Provider not found' });
    this.assertOwner(userId, provider);

    // Check if this place is already claimed by another provider
    const claimed = await this.db.execute<{ id: string }>(
      sql`SELECT id FROM providers.provider WHERE claimed_place_id = ${placeId} AND id != ${providerId} LIMIT 1`,
    );
    if (claimed.rows.length > 0) throw new ConflictException({ code: 'place_already_claimed', title: 'Place claimed by another provider' });

    const [updated] = await this.db.update(providerTable).set({ claimedPlaceId: placeId, updatedAt: new Date() }).where(eq(providerTable.id, providerId)).returning();
    return updated!;
  }

  async submit(userId: UserId, providerId: ProviderId): Promise<ProviderRow> {
    const provider = await this.getById(providerId);
    if (!provider) throw new NotFoundException({ code: 'provider_not_found', title: 'Provider not found' });
    this.assertOwner(userId, provider);

    if (provider.status !== 'draft') throw new ConflictException({ code: 'already_submitted', title: 'Provider is not a draft' });
    if (!provider.businessPhoneVerifiedAt) throw new ConflictException({ code: 'phone_not_verified', title: 'Business phone not verified' });

    const [updated] = await this.db
      .update(providerTable)
      .set({ status: 'pending', submittedAt: new Date(), updatedAt: new Date() })
      .where(eq(providerTable.id, providerId))
      .returning();

    await this.db.insert(auditLogTable).values({ providerId, action: 'submitted', actorUserId: userId, reason: null });
    return updated!;
  }

  async grantConsent(userId: UserId, providerId: ProviderId, scope: ConsentScope, evidence: ConsentEvidence): Promise<void> {
    const provider = await this.getById(providerId);
    if (!provider) throw new NotFoundException({ code: 'provider_not_found', title: 'Provider not found' });
    this.assertOwner(userId, provider);

    // Upsert: revoke old record if present, insert new
    await this.db
      .update(consentTable)
      .set({ revokedAt: new Date() })
      .where(and(eq(consentTable.providerId, providerId), eq(consentTable.scope, scope), isNull(consentTable.revokedAt)));

    await this.db.insert(consentTable).values({ providerId, scope, grantedAt: new Date(), evidence: JSON.stringify(evidence) });

    await this.outbox.publish({
      id: randomUUID(),
      name: 'providers.consent.changed.v1',
      occurredAt: new Date().toISOString(),
      payload: { providerId: providerId as never, scope, granted: true },
    });
  }

  async revokeConsent(userId: UserId, providerId: ProviderId, scope: ConsentScope): Promise<void> {
    const provider = await this.getById(providerId);
    if (!provider) throw new NotFoundException({ code: 'provider_not_found', title: 'Provider not found' });
    this.assertOwner(userId, provider);

    await this.db
      .update(consentTable)
      .set({ revokedAt: new Date() })
      .where(and(eq(consentTable.providerId, providerId), eq(consentTable.scope, scope), isNull(consentTable.revokedAt)));

    await this.outbox.publish({
      id: randomUUID(),
      name: 'providers.consent.changed.v1',
      occurredAt: new Date().toISOString(),
      payload: { providerId: providerId as never, scope, granted: false },
    });
  }

  async getConsentLedger(providerId: ProviderId): Promise<ConsentLedger> {
    const records = await this.db.select().from(consentTable).where(eq(consentTable.providerId, providerId));
    const active = records.filter((r) => !r.revokedAt).map((r) => r.scope as ConsentScope);
    return {
      active,
      records: records.map((r) => ({
        scope: r.scope as ConsentScope,
        grantedAt: r.grantedAt.toISOString(),
        revokedAt: r.revokedAt?.toISOString() ?? null,
        evidence: JSON.parse(r.evidence) as { textVersion: string; locale: 'ar' | 'ckb' | 'en' },
      })),
    };
  }

  async getPublicProfile(placeId: PlaceId): Promise<PublicProviderProfile | null> {
    const [provider] = await this.db
      .select()
      .from(providerTable)
      .where(sql`claimed_place_id = ${placeId} OR id = ${placeId.startsWith('p') ? placeId.slice(1) : ''}`)
      .limit(1);

    if (!provider) return null;

    const activeConsents = await this.getActiveConsents(provider.id as ProviderId);
    const record = this.toProviderRecord(provider, activeConsents);
    return publicProfileOf(record);
  }

  async adminGetProvider(providerId: ProviderId): Promise<AdminProviderView | null> {
    const provider = await this.getById(providerId);
    if (!provider) return null;

    const activeConsents = await this.getActiveConsents(providerId);
    const auditRows = await this.db.select().from(auditLogTable).where(eq(auditLogTable.providerId, providerId));
    const consentLedger = await this.getConsentLedger(providerId);

    return this.toAdminView(provider, activeConsents, consentLedger, auditRows);
  }

  async adminVerify(adminUserId: UserId, providerId: ProviderId): Promise<ProviderRow> {
    const provider = await this.getById(providerId);
    if (!provider) throw new NotFoundException({ code: 'provider_not_found', title: 'Provider not found' });
    if (provider.status !== 'pending') throw new ConflictException({ code: 'not_pending', title: 'Provider is not pending' });

    const [updated] = await this.db.update(providerTable).set({ status: 'verified', updatedAt: new Date() }).where(eq(providerTable.id, providerId)).returning();

    await this.db.insert(auditLogTable).values({ providerId, action: 'verified', actorUserId: adminUserId, reason: null });

    await this.outbox.publish({
      id: randomUUID(),
      name: 'providers.provider.verified.v1',
      occurredAt: new Date().toISOString(),
      payload: { providerId: providerId as never },
    });

    await this.publishProfileUpdated(updated!);
    return updated!;
  }

  async adminSuspend(adminUserId: UserId, providerId: ProviderId, reason: string): Promise<ProviderRow> {
    const provider = await this.getById(providerId);
    if (!provider) throw new NotFoundException({ code: 'provider_not_found', title: 'Provider not found' });

    const [updated] = await this.db
      .update(providerTable)
      .set({ status: 'suspended', suspensionReason: reason, updatedAt: new Date() })
      .where(eq(providerTable.id, providerId))
      .returning();

    await this.db.insert(auditLogTable).values({ providerId, action: 'suspended', actorUserId: adminUserId, reason });

    await this.outbox.publish({
      id: randomUUID(),
      name: 'providers.provider.suspended.v1',
      occurredAt: new Date().toISOString(),
      payload: { providerId: providerId as never },
    });

    return updated!;
  }

  async adminListQueue(status: string, cursor?: string): Promise<{ items: AdminProviderView[]; nextCursor: string | null }> {
    const limit = 20;
    const rows = await this.db
      .select()
      .from(providerTable)
      .where(cursor ? sql`status = ${status}::providers.provider_status AND id > ${cursor}` : sql`status = ${status}::providers.provider_status`)
      .orderBy(providerTable.id)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    const views = await Promise.all(
      items.map(async (p) => {
        const consents = await this.getActiveConsents(p.id as ProviderId);
        const ledger = await this.getConsentLedger(p.id as ProviderId);
        const audit = await this.db.select().from(auditLogTable).where(eq(auditLogTable.providerId, p.id));
        return this.toAdminView(p, consents, ledger, audit);
      }),
    );

    return {
      items: views,
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  toProviderMe(provider: ProviderRow, activeConsents: ConsentScope[]): ProviderMe {
    return {
      id: provider.id as ProviderId,
      status: provider.status as never,
      name: provider.name,
      category: provider.category as never,
      location: provider.location ? (JSON.parse(provider.location) as [number, number]) : null,
      phone: provider.businessPhone
        ? { number: provider.businessPhone as never, verified: !!provider.businessPhoneVerifiedAt }
        : null,
      claimedPlaceId: (provider.claimedPlaceId as PlaceId) ?? null,
      hoursRaw: provider.hoursRaw ?? null,
      prices: JSON.parse(provider.prices) as never[],
      links: JSON.parse(provider.links) as never[],
      photos: [],
      consents: activeConsents,
      suspensionReason: provider.suspensionReason ?? null,
    };
  }

  private toAdminView(provider: ProviderRow, activeConsents: ConsentScope[], ledger: ConsentLedger, auditRows: AuditRow[]): AdminProviderView {
    const me = this.toProviderMe(provider, activeConsents);
    return {
      ...me,
      ownerUserId: provider.userId as UserId,
      submittedAt: provider.submittedAt?.toISOString() ?? null,
      audit: auditRows.map((r) => ({
        action: r.action as 'submitted' | 'verified' | 'suspended',
        actorUserId: r.actorUserId as UserId,
        reason: r.reason ?? null,
        at: r.at.toISOString(),
      })),
    };
  }

  private toProviderRecord(provider: ProviderRow, activeConsents: ConsentScope[]): ProviderRecord {
    return {
      providerId: provider.id as ProviderId,
      status: provider.status as never,
      phone: (provider.businessPhoneVerifiedAt ? provider.businessPhone : null) as never,
      photos: [],
      hoursRaw: provider.hoursRaw ?? null,
      social: JSON.parse(provider.links) as never,
      prices: JSON.parse(provider.prices) as never,
      consents: activeConsents,
    };
  }

  async getActiveConsents(providerId: ProviderId): Promise<ConsentScope[]> {
    const rows = await this.db.select({ scope: consentTable.scope }).from(consentTable).where(and(eq(consentTable.providerId, providerId), isNull(consentTable.revokedAt)));
    return rows.map((r) => r.scope as ConsentScope);
  }

  private async publishProfileUpdated(provider: ProviderRow): Promise<void> {
    await this.outbox.publish({
      id: randomUUID(),
      name: 'providers.profile.updated.v1',
      occurredAt: new Date().toISOString(),
      payload: {
        providerId: provider.id as never,
        name: provider.name,
        category: provider.category as never,
        location: provider.location ? (JSON.parse(provider.location) as [number, number]) : null,
        claimedPlaceId: (provider.claimedPlaceId as PlaceId) ?? null,
      },
    });
  }

  private assertOwner(userId: UserId, provider: ProviderRow): void {
    if (provider.userId !== userId) throw new ForbiddenException({ code: 'not_owner', title: 'Access denied' });
  }
}

export type ProviderRow = typeof providerTable.$inferSelect;
export type AuditRow = typeof auditLogTable.$inferSelect;
