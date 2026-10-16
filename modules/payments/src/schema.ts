import {
  bigint,
  boolean,
  char,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const paymentsSchema = pgSchema('payments');

// ─── Wallet ───────────────────────────────────────────────────────────────────

export const walletTable = paymentsSchema.table(
  'wallet',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().unique(),
    /** Balance in IQD dinars (integer — no fractions in Iraqi Dinar). */
    balanceIqd: bigint('balance_iqd', { mode: 'number' }).notNull().default(0),
    /** Funds held for pending payments. */
    heldIqd: bigint('held_iqd', { mode: 'number' }).notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('wallet_user_id_idx').on(t.userId)],
);

// ─── Transaction ──────────────────────────────────────────────────────────────

export const transactionTable = paymentsSchema.table(
  'transaction',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => walletTable.id, { onDelete: 'restrict' }),
    userId: uuid('user_id').notNull(),
    type: text('type').notNull().$type<'credit' | 'debit' | 'hold' | 'release' | 'refund'>(),
    status: text('status').notNull().default('pending').$type<'pending' | 'completed' | 'failed' | 'reversed'>(),
    amountIqd: bigint('amount_iqd', { mode: 'number' }).notNull(),
    balanceAfterIqd: bigint('balance_after_iqd', { mode: 'number' }).notNull(),
    description: text('description').notNull().default(''),
    paymentIntentId: uuid('payment_intent_id'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('transaction_wallet_id_created_idx').on(t.walletId, t.createdAt),
    index('transaction_user_id_created_idx').on(t.userId, t.createdAt),
    index('transaction_payment_intent_idx').on(t.paymentIntentId),
  ],
);

// ─── Payment method ───────────────────────────────────────────────────────────

export const paymentMethodTable = paymentsSchema.table(
  'payment_method',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    type: text('type').notNull().$type<'card' | 'wallet' | 'cash_on_delivery'>(),
    cardLast4: char('card_last4', { length: 4 }),
    cardBrand: text('card_brand').$type<'visa' | 'mastercard' | 'other'>(),
    cardExpiryMonth: smallint('card_expiry_month'),
    cardExpiryYear: smallint('card_expiry_year'),
    cardHolderName: text('card_holder_name'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('payment_method_user_id_idx').on(t.userId)],
);

// ─── Payment intent ───────────────────────────────────────────────────────────

export const paymentIntentTable = paymentsSchema.table(
  'payment_intent',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    currency: text('currency').notNull().default('IQD').$type<'IQD' | 'USD'>(),
    status: text('status')
      .notNull()
      .default('pending')
      .$type<
        | 'pending'
        | 'requires_confirmation'
        | 'processing'
        | 'succeeded'
        | 'failed'
        | 'refunded'
        | 'partially_refunded'
        | 'cancelled'
      >(),
    paymentMethodId: uuid('payment_method_id').references(() => paymentMethodTable.id, { onDelete: 'set null' }),
    description: text('description').notNull().default(''),
    metadata: jsonb('metadata').notNull().default({}),
    flaggedForReview: boolean('flagged_for_review').notNull().default(false),
    refundedAmount: bigint('refunded_amount', { mode: 'number' }).notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payment_intent_user_id_status_idx').on(t.userId, t.status),
    index('payment_intent_created_at_idx').on(t.createdAt),
    index('payment_intent_expires_at_idx').on(t.expiresAt),
  ],
);

// ─── Rate-limit buckets ───────────────────────────────────────────────────────

export const rateLimitTable = paymentsSchema.table(
  'rate_limit',
  {
    userId: uuid('user_id').notNull(),
    bucket: text('bucket').notNull(),
    count: integer('count').notNull().default(1),
    windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.bucket] }),
    index('rate_limit_window_end_idx').on(t.windowEnd),
  ],
);
