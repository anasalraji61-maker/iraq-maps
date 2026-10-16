import { customType, index, integer, pgSchema, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

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
    /** Typical first-reply time in whole hours (M193). */
    avgResponseHours: integer('avg_response_hours'),
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

export const promotionStatusEnum = providersSchema.enum('promotion_status', ['active', 'expired', 'deleted']);

export const promotionTable = providersSchema.table(
  'promotion',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providerTable.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    discountPct: integer('discount_pct'),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validTo: timestamp('valid_to', { withTimezone: true }).notNull(),
    conditions: text('conditions'),
    status: promotionStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('promotion_provider_id_idx').on(t.providerId), index('promotion_valid_to_idx').on(t.validTo)],
);

export const appointmentStatusEnum = providersSchema.enum('appointment_status', ['pending', 'confirmed', 'cancelled', 'completed']);

export const appointmentTable = providersSchema.table(
  'appointment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providerTable.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    date: text('date').notNull(), // ISO YYYY-MM-DD
    time: text('time').notNull(), // HH:MM
    service: text('service').notNull(),
    status: appointmentStatusEnum('status').notNull().default('pending'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('appointment_provider_id_idx').on(t.providerId),
    index('appointment_user_id_idx').on(t.userId),
    index('appointment_date_idx').on(t.date),
  ],
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

// ─── Staff ────────────────────────────────────────────────────────────────────

export const staffRoleEnum = providersSchema.enum('staff_role', ['owner', 'manager', 'staff']);

export const staffTable = providersSchema.table(
  'staff',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providerTable.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    phone: text('phone').notNull(),
    role: staffRoleEnum('role').notNull().default('staff'),
    /** JSON: { replyMessages, managePosts, viewAnalytics, manageAppointments } */
    permissions: text('permissions').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('staff_provider_id_idx').on(t.providerId),
    index('staff_user_id_idx').on(t.userId),
  ],
);

// ─── Menu ─────────────────────────────────────────────────────────────────────

export const menuSectionTable = providersSchema.table(
  'menu_section',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providerTable.id, { onDelete: 'cascade' }),
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('menu_section_provider_idx').on(t.providerId)],
);

export const menuItemTable = providersSchema.table(
  'menu_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => menuSectionTable.id, { onDelete: 'cascade' }),
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en').notNull().default(''),
    descAr: text('desc_ar').notNull().default(''),
    descEn: text('desc_en').notNull().default(''),
    priceIqd: integer('price_iqd').notNull().default(0),
    photoAssetId: text('photo_asset_id'),
    outOfStock: integer('out_of_stock').notNull().default(0), // 0/1 boolean
    seasonal: integer('seasonal').notNull().default(0),
    limitedTime: integer('limited_time').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('menu_item_section_idx').on(t.sectionId)],
);
