import { customType, index, pgSchema, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const providersSchema = pgSchema('providers');

const geometry = customType<{ data: string }>({
  dataType() {
    return 'geometry(Point, 4326)';
  },
});

export const providerStatusEnum = providersSchema.enum('provider_status', ['draft', 'pending', 'verified', 'suspended']);
export const consentScopeEnum = providersSchema.enum('consent_scope', ['photos', 'social_links', 'whatsapp_messages', 'show_phone', 'show_prices']);

export const providerTable = providersSchema.table(
  'provider',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    status: providerStatusEnum('status').notNull().default('draft'),
    businessPhone: text('business_phone'),
    businessPhoneVerifiedAt: timestamp('business_phone_verified_at', { withTimezone: true }),
    phoneVerificationId: text('phone_verification_id'),
    name: text('name').notNull(),
    category: text('category').notNull(),
    location: geometry('location'),
    claimedPlaceId: text('claimed_place_id'),
    hoursRaw: text('hours_raw'),
    prices: text('prices').notNull().default('[]'), // JSON stored as text
    links: text('links').notNull().default('[]'),
    photoAssetIds: text('photo_asset_ids').notNull().default('[]'),
    suspensionReason: text('suspension_reason'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('provider_user_id_idx').on(t.userId), index('provider_claimed_place_id_idx').on(t.claimedPlaceId)],
);

export const consentTable = providersSchema.table(
  'consent',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providerTable.id, { onDelete: 'cascade' }),
    scope: consentScopeEnum('scope').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    evidence: text('evidence').notNull(), // JSON
  },
  (t) => [unique('consent_provider_scope_unique').on(t.providerId, t.scope), index('consent_provider_id_idx').on(t.providerId)],
);

export const auditLogTable = providersSchema.table(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providerTable.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    actorUserId: uuid('actor_user_id').notNull(),
    reason: text('reason'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_provider_id_idx').on(t.providerId)],
);
